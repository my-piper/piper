import { DatePipe } from "@angular/common";
import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { TuiButton, TuiLoader } from "@taiga-ui/core";
import { TuiButtonLoading, TuiChip } from "@taiga-ui/kit";
import { finalize, Subscription } from "rxjs";
import { Languages } from "src/enums/languages";
import { Launch } from "src/models/launch";
import { LaunchLogs, LogLevel } from "src/models/launch-logs";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { HttpService } from "src/services/http.service";
import { LaunchFeeds } from "src/services/launch-feeds";
import { getLabel } from "src/utils/i18n";
import { toInstance } from "src/utils/models";
import { DrawerCloseComponent } from "src/app/drawer-close/drawer-close.component";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

// The Node Logs of a launch: of all its nodes, or of the one node the route
// opens it for.
@Component({
  selector: "app-launch-logs",
  templateUrl: "./launch-logs.component.html",
  styleUrls: ["./launch-logs.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DrawerCloseComponent,
    TuiButton,
    TuiButtonLoading,
    TuiChip,
    TuiLoader,
  ],
})
export class LaunchLogsComponent implements OnInit {
  private readonly http = inject(HttpService);
  private readonly feeds = inject(LaunchFeeds);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly language = inject<Languages>(CURRENT_LANGUAGE);

  readonly levels = LEVELS;

  readonly launch = signal<Launch | null>(null);
  // the node the route opened the logs for; the logs of the whole launch if null
  readonly node = signal<string | null>(null);
  readonly result = signal<LaunchLogs | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly shownLevels = signal<ReadonlySet<LogLevel>>(new Set(LEVELS));
  readonly shownNode = signal<string | null>(null);

  // the nodes that have lines, in the pipeline's order
  readonly nodes = computed(() => {
    const keys = new Set(this.result()?.logs.map(({ node }) => node));
    return [...(this.launch()?.pipeline.nodes.keys() ?? [])].filter((key) =>
      keys.has(key),
    );
  });

  readonly lines = computed(() => {
    const [levels, node] = [this.shownLevels(), this.shownNode()];
    return (this.result()?.logs ?? []).filter(
      (log) => levels.has(log.level) && (!node || log.node === node),
    );
  });

  readonly dropped = computed(() =>
    Object.entries(this.result()?.dropped ?? {})
      .filter(([node]) => !this.shownNode() || node === this.shownNode())
      .map(([node, count]) => ({ node, count })),
  );

  // follow new lines only while the newest line is in view
  private follow = true;
  private events: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.events?.unsubscribe());
    afterEveryRender(() => {
      if (this.follow && this.lastLine()) {
        this.lastLine().scrollIntoView({ block: "end" });
        this.follow = false;
      }
    });
  }

  ngOnInit() {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ launch, node }) => {
        if (launch?._id !== this.launch()?._id) {
          this.listen(launch);
        }
        this.launch.set(launch);
        this.node.set(node?.id ?? null);
        this.shownNode.set(node?.id ?? null);
        this.load();
      });
  }

  title(node: string): string {
    const title = this.launch()?.pipeline.nodes.get(node)?.title;
    return getLabel(title, this.language) || node;
  }

  toggleLevel(level: LogLevel) {
    const levels = new Set(this.shownLevels());
    if (!levels.delete(level)) {
      levels.add(level);
    }
    this.shownLevels.set(levels);
  }

  showNode(node: string | null) {
    this.shownNode.set(this.shownNode() === node ? null : node);
  }

  load() {
    const launch = this.launch();
    if (!launch) {
      return;
    }

    const last = this.lastLine();
    this.follow = !last || last.getBoundingClientRect().top < innerHeight;
    this.loading.set(true);
    this.http
      .get(
        `launches/${launch._id}/logs`,
        this.node() ? { node: this.node() } : {},
      )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => {
          this.result.set(toInstance(data as object, LaunchLogs));
          this.error.set(null);
        },
        error: (err) => this.error.set(err.message ?? String(err)),
      });
  }

  /** New lines come when a node repeats, fails or finishes. */
  private listen(launch: Launch) {
    this.events?.unsubscribe();
    this.events = this.feeds
      .events(launch._id, null, ["repeat", "error", "done"])
      .subscribe(({ node }) => {
        if (!this.node() || node === this.node()) {
          this.load();
        }
      });
  }

  private lastLine(): HTMLElement | null {
    return this.host.nativeElement.querySelector(".line:last-of-type");
  }
}
