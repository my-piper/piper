import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import assign from "lodash/assign";
import { delay, finalize, map, takeUntil } from "rxjs";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { AppConfig } from "src/models/app-config";
import { Pipeline } from "src/models/pipeline";
import { LaunchProject, Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
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

  constructor(
    public projectManager: ProjectManager,
    private http: HttpService,
    public config: AppConfig,
    private router: Router,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      [this.project, this.pipeline] = [project, project.pipeline];
    });

    this.projectManager.error
      .pipe(takeUntil(this.destroyed$))
      .subscribe((error) => (this.error = error));

    this.projectManager.updates
      .pipe(takeUntil(this.destroyed$))
      .subscribe(() => this.cd.detectChanges());
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
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
        map((json) => toInstance(json as object, Project))
      )
      .subscribe((project) => {
        this.router.navigate(["/projects", project._id]);
      });
  }
}
