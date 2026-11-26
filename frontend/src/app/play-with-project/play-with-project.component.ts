import {
  ChangeDetectorRef,
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { delay, map } from "rxjs";
import { Project, ProjectSummary } from "src/models/project";
import { PipelineLaunchedSignal } from "src/models/signals/launch";
import { HttpService } from "src/services/http.service";
import { SignalsService } from "src/services/signals.service";
import { UI_DELAY } from "src/consts/ui";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-play-with-project",
  templateUrl: "./play-with-project.component.html",
  styleUrls: ["./play-with-project.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PlayWithProjectComponent {
  private readonly destroyRef = inject(DestroyRef);

  error!: Error;

  project!: Project;
  summary: ProjectSummary;

  constructor(
    private route: ActivatedRoute,
    private signals: SignalsService,
    private router: Router,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.cd.detectChanges();
      this.loadSummary();
    });

    this.signals.feed
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
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
        map((json) => toInstance(json as object, ProjectSummary)),
      )
      .subscribe({
        next: (summary) => {
          this.summary = summary;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }
}
