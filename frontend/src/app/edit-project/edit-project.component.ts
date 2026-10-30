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
import { Languages } from "src/ui-kit/enums/languages";
import { getLabel } from "src/ui-kit/utils/i18n";
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

  visibilityControl = this.fb.control<ProjectVisibility>(
    ProjectVisibility.private
  );
  form = this.fb.group({
    visibility: this.visibilityControl,
    slug: this.fb.control<string>(null),
    order: this.fb.control<number>(0),
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
    const { title, visibility, slug, order, group } = this.project;
    this.form.patchValue({
      group: group ?? null,
      visibility,
      slug:
        slug || getLabel(title, Languages.en).toLowerCase().replace(/\s/g, "-"),
      order,
    });
  }

  save() {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    this.progress.saving = true;
    this.cd.detectChanges();

    const { visibility, slug, order, group } = this.form.getRawValue();
    const request = new Project({
      visibility,
      slug,
      order,
      group: group?.trim() || null,
    });
    this.http
      .post(`projects/${this.project._id}`, request)
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
