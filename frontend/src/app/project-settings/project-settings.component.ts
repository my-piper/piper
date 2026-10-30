import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { delay, finalize, map } from "rxjs";
import { AppError } from "src/models/errors";
import { Project, ProjectSettings } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";

// option value that can never collide with a real group name
const NEW_GROUP = "\u0000new";

@Component({
  selector: "app-project-settings",
  templateUrl: "./project-settings.component.html",
  styleUrls: ["./project-settings.component.scss"],
})
export class ProjectSettingsComponent implements OnInit {
  readonly NEW_GROUP = NEW_GROUP;

  _project!: Project;

  progress = { saving: false };
  error!: AppError;
  groups: string[] = [];

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
    group: this.fb.control<string>(null),
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
      if (group === NEW_GROUP) {
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
          this.groups = this.withCurrent(groups);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  private withCurrent(groups: string[]) {
    const { group } = this.project;
    return group && !groups.includes(group) ? [group, ...groups] : groups;
  }

  private build() {
    const { group } = this.project;
    this.groups = this.withCurrent(this.groups);
    this.form.patchValue({ group: group ?? null, newGroup: null });
  }

  save() {
    this.progress.saving = true;
    this.cd.detectChanges();

    const { group, newGroup } = this.form.getRawValue();
    const value = group === NEW_GROUP ? newGroup : group;
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
