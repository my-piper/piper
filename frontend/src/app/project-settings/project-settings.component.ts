import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { delay, finalize, map } from "rxjs";
import { AppError } from "src/models/errors";
import { Project, ProjectSettings } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-project-settings",
  templateUrl: "./project-settings.component.html",
  styleUrls: ["./project-settings.component.scss"],
})
export class ProjectSettingsComponent implements OnInit {
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
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.http
      .get("projects/groups")
      .pipe(map((arr) => arr as string[]))
      .subscribe({
        next: (groups) => {
          this.groups = groups;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  private build() {
    const { group } = this.project;
    this.form.patchValue({ group: group ?? null });
  }

  save() {
    this.progress.saving = true;
    this.cd.detectChanges();

    const { group } = this.form.getRawValue();
    const request = new ProjectSettings({ group: group?.trim() || null });
    this.http
      .post(`projects/${this.project._id}/settings`, request)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.saving = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, Project))
      )
      .subscribe({
        next: (project) => this.updated.emit(project),
        error: (err) => (this.error = err),
      });
  }
}
