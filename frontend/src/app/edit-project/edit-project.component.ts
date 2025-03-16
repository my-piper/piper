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
import { ProjectVisibility } from "src/enums/project-visibility";
import { AppError } from "src/models/errors";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-edit-project",
  templateUrl: "./edit-project.component.html",
  styleUrls: ["./edit-project.component.scss"],
})
export class EditProjectComponent implements OnInit {
  origin = location.origin;
  userRole = UserRole;

  _project!: Project;

  schemas = SCHEMAS;

  progress = { saving: false };
  error!: AppError;

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

  visibilityControl = this.fb.control<ProjectVisibility>(
    ProjectVisibility.private
  );
  form = this.fb.group({
    visibility: this.visibilityControl,
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.form.valueChanges.subscribe(() => this.save());
  }

  private build() {
    const { visibility } = this.project;
    this.form.patchValue({ visibility });
  }

  save() {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    this.progress.saving = true;
    this.cd.detectChanges();

    const { visibility } = this.form.getRawValue();
    const request = new Project({ visibility });
    this.http
      .post(`projects/${this.project._id}`, request)
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
