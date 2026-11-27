import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { addDays, format, parseISO } from "date-fns";
import { Subscription, delay, finalize, map } from "rxjs";
import {
  DailyRuns,
  ProjectStats,
  STATS_PERIODS,
  StatsPeriod,
} from "src/models/project-stats";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import { toInstance } from "src/utils/models";

const DAY_FORMAT = "yyyy-MM-dd";

// every day of the period, including days without runs
export function fillDays(
  daily: DailyRuns[],
  days: number,
  today = new Date(),
): DailyRuns[] {
  const known = new Map(daily.map((d) => [d.day, d]));
  return Array.from({ length: days }, (_, i) => {
    const day = format(addDays(today, i - days + 1), DAY_FORMAT);
    return known.get(day) ?? new DailyRuns({ day });
  });
}

@Component({
  selector: "app-project-stats",
  templateUrl: "./project-stats.component.html",
  styleUrls: ["./project-stats.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProjectStatsComponent implements OnInit {
  periods = STATS_PERIODS;

  project!: Project;
  days: StatsPeriod = 30;
  stats: ProjectStats | null = null;
  daily: DailyRuns[] = [];
  maxDailyRuns = 0;

  progress = { loading: false };
  error: Error | null = null;

  private loading$?: Subscription;

  constructor(
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.load();
    });
  }

  select(days: StatsPeriod) {
    if (days !== this.days) {
      this.days = days;
      this.load();
    }
  }

  load() {
    this.loading$?.unsubscribe();
    this.progress.loading = true;
    this.error = null;
    this.cd.detectChanges();

    this.loading$ = this.http
      .get(`projects/${this.project._id}/stats`, { days: this.days })
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, ProjectStats)),
      )
      .subscribe({
        next: (stats) => {
          this.stats = stats;
          this.daily = fillDays(stats.daily, stats.days);
          this.maxDailyRuns = Math.max(0, ...this.daily.map((d) => d.runs));
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  // share of the chart height, in percents
  height(runs: number): number {
    return this.maxDailyRuns > 0 ? (runs * 100) / this.maxDailyRuns : 0;
  }

  dayLabel(day: string): string {
    return format(parseISO(day), "MMM d");
  }

  nodeTitle(id: string): string {
    return this.project.pipeline.nodes.get(id)?.title ?? id;
  }
}
