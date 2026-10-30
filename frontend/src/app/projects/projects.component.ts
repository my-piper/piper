import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
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
  progress = { loading: false, creating: false, deleting: false };

  references: { popover: PopoverComponent } = { popover: null };

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
  allGroups: string[] = [];

  searchControl = this.fb.control<string>(null);
  tagsControl = this.fb.control<string[]>([]);
  groupControl = this.fb.control<string>(null);
  form = this.fb.group({
    search: this.searchControl,
    tags: this.tagsControl,
    group: this.groupControl,
  });

  private loading$!: Subscription;

  constructor(
    private router: Router,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
    private fb: FormBuilder
  ) {}

  async ngOnInit() {
    this.loadTags();
    this.loadGroups();
    await this.load();

    this.searchControl.valueChanges
      .pipe(debounceTime(500))
      .subscribe(() => this.load());
    this.tagsControl.valueChanges.subscribe(() => this.load());
    this.groupControl.valueChanges.subscribe(() => this.load());
  }

  private loadGroups() {
    this.http
      .get("projects/groups")
      .pipe(map((arr) => arr as string[]))
      .subscribe({
        next: (groups) => {
          this.allGroups = groups;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  selectGroup(group: string) {
    this.groupControl.setValue(
      group === this.groupControl.value ? null : group,
    );
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
    const group = this.groupControl.value;
    this.loading$ = this.http
      .get(
        "projects",
        toPlain(
          new ProjectsFilter({
            cursor,
            ...(search ? { search } : {}),
            ...(tags.length > 0 ? { tags } : {}),
            ...(group ? { group } : {}),
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

  remove(index: number, { _id }: Project) {
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
          this.projects.splice(index, 1);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }
}
