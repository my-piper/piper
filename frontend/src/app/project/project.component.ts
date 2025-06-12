import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { delay, filter, finalize, map, takeUntil } from "rxjs";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { LaunchComponent } from "src/app/launch/launch.component";
import { AppConfig } from "src/models/app-config";
import { Launch } from "src/models/launch";
import { Pipeline } from "src/models/pipeline";
import { LaunchProject, Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { toInstance, toPlain } from "src/utils/models";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";
import { PipelineReadmeComponent } from "../pipeline-readme/pipeline-readme.component";

@Component({
  selector: "app-project",
  templateUrl: "./project.component.html",
  styleUrls: ["./project.component.scss"],
})
export class ProjectComponent extends UntilDestroyed implements OnInit {
  userRole = UserRole;
  launchComponent = LaunchComponent;
  pipelineReadmeComponent = PipelineReadmeComponent;

  progress = { launching: false, cloning: false };
  error: Error;

  pipeline!: Pipeline;
  project!: Project;

  references: { popover: PopoverComponent | null } = { popover: null };
  child!:
    | EditPipelineVisualComponent
    | LaunchComponent
    | PipelineReadmeComponent;

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
    this.projectManager.error
      .pipe(takeUntil(this.destroyed$))
      .subscribe((error) => (this.error = error));
    this.projectManager.status
      .pipe(
        filter((status) => status === "saved"),
        takeUntil(this.destroyed$)
      )
      .subscribe(() => this.cd.detectChanges());
    this.route.data.subscribe(({ project }) => {
      [this.project, this.pipeline] = [project, project.pipeline];
    });
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
  }

  launch() {
    this.progress.launching = true;
    this.cd.detectChanges();

    const request = new LaunchProject();

    this.http
      .post(`projects/${this.project._id}/launch`, toPlain(request))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.launching = false;
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(Launch, json as Object))
      )
      .subscribe((launch) => {
        this.router.navigate(["./launches", launch._id], {
          relativeTo: this.route,
        });
      });
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
      .subscribe((launch) => {
        this.router.navigate(["/projects", launch._id]);
      });
  }
}
