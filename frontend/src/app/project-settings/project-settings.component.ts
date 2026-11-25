import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { delay, finalize, map } from "rxjs";
import { AppError } from "src/models/errors";
import { Project, ProjectSettings } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import { toInstance } from "src/utils/models";

// option values that can never collide with a real Folder name; "no Folder"
// gets one too, as Taiga shows a null select value as empty
const NO_FOLDER = "\u0000none";
const NEW_FOLDER = "\u0000new";

/** Moves a Project into a Folder (`group` on the wire), a new one or none. */
@Component({
  selector: "app-project-settings",
  templateUrl: "./project-settings.component.html",
  styleUrls: ["./project-settings.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProjectSettingsComponent implements OnInit {
  readonly NEW_FOLDER = NEW_FOLDER;

  private texts = {
    noFolder: $localize`:@@label.no_folder:No folder`,
    newFolder: $localize`:@@label.new_folder_option:+ New folder…`,
  };

  /** The Folder select's labels: its sentinel options and Folder names. */
  folderLabel = (folder: string) =>
    folder === NO_FOLDER
      ? this.texts.noFolder
      : folder === NEW_FOLDER
        ? this.texts.newFolder
        : folder;

  _project!: Project;

  progress = { saving: false };
  error!: AppError;
  private groups: string[] = [];
  /** The Folder select's choices: none, every existing Folder, a new one. */
  folders = [NO_FOLDER, NEW_FOLDER];

  @Input()
  set project(project: Project) {
    this._project = project;
    this.build();
  }
  get project() {
    return this._project;
  }

  @Output()
  updated = new EventEmitter<Project>();

  form = this.fb.group({
    group: this.fb.control<string>(NO_FOLDER),
    newGroup: this.fb.control<string>({ value: null, disabled: true }, [
      Validators.required,
      Validators.pattern(/\S/),
    ]),
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.form.controls.group.valueChanges.subscribe((group) => {
      const { newGroup } = this.form.controls;
      if (group === NEW_FOLDER) {
        newGroup.enable();
      } else {
        newGroup.disable();
      }
    });

    this.http
      .get("projects/groups")
      .pipe(map((arr) => arr as string[]))
      .subscribe({
        next: (groups) => {
          this.setFolders(groups);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  /** Lists the Folders, keeping the Project's own even when the API omits it. */
  private setFolders(groups: string[]) {
    const { group } = this.project;
    this.groups =
      group && !groups.includes(group) ? [group, ...groups] : groups;
    this.folders = [NO_FOLDER, ...this.groups, NEW_FOLDER];
  }

  private build() {
    const { group } = this.project;
    this.setFolders(this.groups);
    this.form.patchValue({ group: group || NO_FOLDER, newGroup: null });
  }

  save() {
    this.progress.saving = true;
    this.cd.detectChanges();

    const { group, newGroup } = this.form.getRawValue();
    const value =
      group === NEW_FOLDER ? newGroup : group === NO_FOLDER ? null : group;
    const request = new ProjectSettings({ group: value?.trim() || null });
    this.http
      .post(`projects/${this.project._id}/settings`, request)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.saving = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, Project)),
      )
      .subscribe({
        next: (project) => this.updated.emit(project),
        error: (err) => (this.error = err),
      });
  }
}
