import {
  ChangeDetectorRef,
  Component,
  Inject,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import assign from "lodash/assign";
import { debounceTime, delay, finalize, map, takeUntil } from "rxjs";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { AppConfig } from "src/models/app-config";
import { DisplayError } from "src/models/errors";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/consts/ui";
import { ModalService } from "src/ui-kit/modal/modal.service";
import { Languages } from "src/enums/languages";
import { UntilDestroyed } from "src/utils/until-destroyed";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { getLabel } from "src/utils/i18n";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-project",
  templateUrl: "./project.component.html",
  styleUrls: ["./project.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProjectComponent extends UntilDestroyed implements OnInit {
  userRole = UserRole;
  editPipelineVisualComponent = EditPipelineVisualComponent;

  progress = { launching: false, cloning: false };
  error: DisplayError;

  pipeline!: Pipeline;
  project!: Project;

  child!: unknown;
  /** Index of the active section tab; Canvas is the first. */
  activeTab = 0;

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
    private modal: ModalService,
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

  settingsUpdated(project: Project) {
    this.updated(project);
    this.modal.close();
  }

  clone() {
    this.progress.cloning = true;
    this.cd.detectChanges();

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

  /**
   * The canvas owns no route of its own beyond the project root (drawers add
   * outlets to it), so its tab is selected from the routed child instead of
   * RouterLinkActive.
   */
  activate(child: unknown) {
    this.child = child;
    if (child instanceof EditPipelineVisualComponent) {
      this.activeTab = 0;
    }
  }
}
