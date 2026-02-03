import { ChangeDetectorRef, Component, Inject, OnInit } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import assign from "lodash/assign";
import { debounceTime, delay, finalize, map, takeUntil } from "rxjs";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { AppConfig } from "src/models/app-config";
import { Pipeline } from "src/models/pipeline";
import { LaunchProject, Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { getLabel } from "src/ui-kit/utils/i18n";
import { toInstance } from "src/utils/models";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";

@Component({
  selector: "app-project",
  templateUrl: "./project.component.html",
  styleUrls: ["./project.component.scss"],
})
export class ProjectComponent extends UntilDestroyed implements OnInit {
  userRole = UserRole;
  editPipelineVisualComponent = EditPipelineVisualComponent;

  progress = { launching: false, cloning: false };
  error: Error;

  pipeline!: Pipeline;
  project!: Project;

  references: { popover: PopoverComponent | null } = { popover: null };
  child!: unknown;

  form = this.fb.group({
    name: this.fb.control<string>(null, [Validators.required]),
  });

  constructor(
    @Inject(CURRENT_LANGUAGE) public language: Languages,
    public projectManager: ProjectManager,
    private http: HttpService,
    public config: AppConfig,
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
  ) {
    super();
  }

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      [this.project, this.pipeline] = [project, project.pipeline];
      this.build();
    });

    this.projectManager.error
      .pipe(takeUntil(this.destroyed$))
      .subscribe((error) => (this.error = error));

    this.projectManager.updates
      .pipe(takeUntil(this.destroyed$))
      .subscribe(() => this.cd.detectChanges());

    this.form.valueChanges
      .pipe(takeUntil(this.destroyed$), debounceTime(300))
      .subscribe(({ name }) => {
        if (
          this.form.valid &&
          name !== getLabel(this.pipeline.name, this.language)
        ) {
          assign(this.pipeline, { name });
          this.projectManager.markDirty();
        }
      });
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
  }

  build() {
    const { name } = this.pipeline;
    this.form.patchValue({ name: getLabel(name, this.language) });
  }

  updated(project: Project) {
    assign(this.project, project);
  }

  clone() {
    this.progress.cloning = true;
    this.cd.detectChanges();

    const request = new LaunchProject();

    this.http
      .post(`projects/${this.project._id}/clone`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.cloning = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, Project)),
      )
      .subscribe((project) => {
        this.router.navigate(["/projects", project._id]);
      });
  }
}
