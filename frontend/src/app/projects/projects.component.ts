import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  QueryList,
  ViewChildren,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import last from "lodash/last";
import { Subscription, debounceTime, delay, finalize, map } from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { Project, ProjectsFilter } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI, UI_DELAY } from "src/ui-kit/consts";
import { SelectMode } from "src/directives/selectable.directive";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { toInstance, toPlain } from "src/utils/models";
import * as YAML from "yaml";
import {
  Folder,
  FOLDER_SEPARATOR,
  FolderCount,
  buildFolders,
  findFolder,
  findFolderByPath,
  matchFolder,
  removeFromFolders,
} from "./folders";
import { ImportProjectComponent } from "./import/import-project.component";
const TEST_PIPELINE = `
name: New project
version: 1
layout:
  left: 200
  top: 200
  zoom: 1
start:
  nodes: []
inputs: {}
outputs: {}
flows: {}
nodes: {}`;

const TEST_REQUEST = {
  nodes: {},
  inputs: {},
};

@Component({
  selector: "app-projects",
  templateUrl: "./projects.component.html",
  styleUrls: ["./projects.component.scss"],
})
export class ProjectsComponent implements OnInit {
  ui = UI;
  userRole = UserRole;
  selectMode = SelectMode;

  private _modal!: ImportProjectComponent;

  error!: Error;
  progress = {
    loading: false,
    creating: false,
    deleting: false,
    renaming: false,
  };

  references: { popover: PopoverComponent } = { popover: null };

  @ViewChildren("nameInput")
  nameInputs!: QueryList<ElementRef<HTMLInputElement>>;

  set modal(modal: ImportProjectComponent) {
    this._modal = modal;
    if (!!modal) {
      modal.imported.subscribe((project) => {
        this.projects.unshift(project);
        this.cd.detectChanges();
      });
    }
  }

  get modal() {
    return this._modal;
  }

  chunk: Project[] = [];
  projects: Project[] = [];
  allTags: string[] = [];
  allFolders: Folder[] = [];

  searchControl = this.fb.control<string>(null);
  tagsControl = this.fb.control<string[]>([]);
  form = this.fb.group({
    search: this.searchControl,
    tags: this.tagsControl,
  });

  private loading$!: Subscription;

  constructor(
    private router: Router,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
    private fb: FormBuilder,
  ) {}

  // like a finder search: results come from every folder
  get searching(): boolean {
    return (
      !!this.searchControl.value?.trim() ||
      (this.tagsControl.value ?? []).length > 0
    );
  }

  get folderSearch(): string {
    return this.searchControl.value?.trim().toLowerCase() ?? "";
  }

  get folders(): Folder[] {
    return (this.tagsControl.value ?? []).length > 0
      ? []
      : this.visibleFolders(this.allFolders);
  }

  visibleFolders(folders: Folder[]): Folder[] {
    const search = this.folderSearch;
    return search ? folders.filter((f) => matchFolder(f, search)) : folders;
  }

  // a search unfolds the branches leading to matching folders
  showChildren(folder: Folder): boolean {
    return folder.expanded || this.folderSearch.length > 0;
  }

  ngOnInit() {
    this.loadTags();
    // a project page links back with its folder to open
    this.loadFolders(this.route.snapshot.queryParamMap.get("folder"));
    this.load();

    this.searchControl.valueChanges
      .pipe(debounceTime(500))
      .subscribe(() => this.load());
    this.tagsControl.valueChanges.subscribe(() => this.load());
  }

  // expands a folder by its stored group or, after a rename, by its path
  private loadFolders(expanded: string | null, path?: string) {
    this.http
      .get("projects/groups/counts")
      .pipe(map((arr) => arr as FolderCount[]))
      .subscribe({
        next: (counts) => {
          this.allFolders = buildFolders(counts);
          if (expanded) {
            this.expandTo(findFolder(this.allFolders, expanded));
          } else if (path) {
            this.expandTo(findFolderByPath(this.allFolders, path));
          }
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  toggleFolder(folder: Folder) {
    folder.expanded = !folder.expanded;
    if (folder.expanded && folder.more && folder.projects.length === 0) {
      this.loadFolder(folder);
    }
    this.cd.detectChanges();
  }

  loadFolder(folder: Folder) {
    folder.loading$?.unsubscribe();
    folder.loading = true;
    this.cd.detectChanges();

    const cursor = last(folder.projects)?.cursor;
    folder.loading$ = this.http
      .get(
        "projects",
        toPlain(
          new ProjectsFilter({
            group: folder.group,
            ...(cursor ? { cursor } : {}),
          }),
        ),
      )
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          folder.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) =>
          (arr as Object[]).map((plain) => toInstance(plain, Project)),
        ),
      )
      .subscribe({
        next: (projects) => {
          folder.projects.push(...projects);
          // stop paging when the count went stale
          if (projects.length === 0) {
            folder.count = folder.projects.length;
          }
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  // shows a search result in place: drops the filters and opens its folder
  revealFolder(group: string) {
    this.form.setValue({ search: null, tags: [] }, { emitEvent: false });
    this.load();
    this.expandTo(findFolder(this.allFolders, group));
  }

  private expandTo(folder: Folder | undefined) {
    for (; folder; folder = folder.parent) {
      if (!folder.expanded) {
        this.toggleFolder(folder);
      }
    }
  }

  startRename(folder: Folder) {
    folder.renaming = true;
    this.cd.detectChanges();
    const input = this.nameInputs.first?.nativeElement;
    input?.focus();
    input?.select();
  }

  cancelRename(folder: Folder) {
    if (!this.progress.renaming) {
      folder.renaming = false;
      this.cd.detectChanges();
    }
  }

  rename(folder: Folder, name: string) {
    name = name.trim();
    if (!name || name === folder.name) {
      this.cancelRename(folder);
      return;
    }

    const to = folder.parent
      ? `${folder.parent.path}${FOLDER_SEPARATOR}${name}`
      : name;
    this.progress.renaming = true;
    this.cd.detectChanges();

    this.http
      .post("projects/groups/rename", { from: folder.path, to })
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.renaming = false;
          folder.renaming = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.loadFolders(null, folder.expanded ? to : undefined);
          // search results show the group of every project
          if (this.searching) {
            this.load();
          }
        },
        error: (err) => (this.error = err),
      });
  }

  private loadTags() {
    this.http
      .get("projects/tags/available")
      .pipe(map((arr) => arr as string[]))
      .subscribe({
        next: (tags) => {
          this.allTags = tags;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  toggleTag(tag: string) {
    const tags = this.tagsControl.value ?? [];
    this.tagsControl.setValue(
      tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],
    );
  }

  private async load(cursor?: string) {
    this.loading$?.unsubscribe();
    this.progress.loading = true;
    this.cd.detectChanges();

    const search = this.searchControl.value?.trim();
    const tags = this.tagsControl.value ?? [];
    // outside a search the list holds only projects outside any folder
    const ungrouped = !this.searching;
    this.loading$ = this.http
      .get(
        "projects",
        toPlain(
          new ProjectsFilter({
            cursor,
            ...(search ? { search } : {}),
            ...(tags.length > 0 ? { tags } : {}),
            ...(ungrouped ? { ungrouped } : {}),
          }),
        ),
      )
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) =>
          (arr as Object[]).map((plain) => toInstance(plain, Project)),
        ),
      )
      .subscribe({
        next: (projects) => {
          if (!cursor) {
            this.projects = [];
          }
          this.chunk = projects;
          this.projects.push(...projects);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  loadMore() {
    const project = last(this.projects);
    if (!!project) {
      this.load(project.cursor);
    }
  }

  create() {
    this.progress.creating = true;
    this.cd.detectChanges();

    const request = new Project({
      title: "Test project",
      pipeline: plainToInstance(Pipeline, YAML.parse(TEST_PIPELINE)),
      launchRequest: plainToInstance(LaunchRequest, TEST_REQUEST),
    });
    this.http
      .post(`projects`, toPlain(request))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.creating = false;
          this.references?.popover?.hide();
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(Project, json as Object)),
      )
      .subscribe({
        next: (project) => {
          this.router.navigate([project._id], { relativeTo: this.route });
        },
        error: (err) => (this.error = err),
      });
  }

  remove({ _id }: Project) {
    this.progress.deleting = true;
    this.cd.detectChanges();

    this.http
      .delete(`projects/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.deleting = false;
          this.references?.popover?.hide();
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.projects = this.projects.filter((p) => p._id !== _id);
          this.allFolders = removeFromFolders(this.allFolders, _id);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  back() {
    this.router.navigate(["./"], {
      relativeTo: this.route,
      queryParamsHandling: "preserve",
    });
  }
}
