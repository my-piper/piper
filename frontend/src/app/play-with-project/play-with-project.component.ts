import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { delay, map } from "rxjs";
import { Project, ProjectSummary } from "src/models/project";
import { PipelineLaunchedSignal } from "src/models/signals/launch";
import { HttpService } from "src/services/http.service";
import { SignalsService } from "src/services/signals.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";

@Component({
  selector: "app-play-with-project",
  templateUrl: "./play-with-project.component.html",
  styleUrls: ["./play-with-project.component.scss"],
})
export class PlayWithProjectComponent {
  error!: Error;

  project!: Project;
  summary: ProjectSummary;

  instances: { popopver?: PopoverComponent } = { popopver: null };

  constructor(
    private route: ActivatedRoute,
    private signals: SignalsService,
    private router: Router,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.cd.detectChanges();
      this.loadSummary();
    });

    this.signals.feed.subscribe((event) => {
      if (event instanceof PipelineLaunchedSignal) {
        this.router.navigate(["./"], {
          relativeTo: this.route,
        });
      }
    });
  }

  loadSummary() {
    this.http
      .get(`projects/${this.project._id}/summary`)
      .pipe(
        delay(UI_DELAY),
        map((json) => toInstance(json as Object, ProjectSummary))
      )
      .subscribe({
        next: (summary) => {
          this.summary = summary;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  go(project: Project) {
    this.router.navigate(["..", project.slug || project._id], {
      relativeTo: this.route,
    });
    this.instances.popopver?.hide();
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }
}
