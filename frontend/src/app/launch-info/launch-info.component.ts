import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { TuiButton, TuiIcon } from "@taiga-ui/core";
import { Launch } from "src/models/launch";
import { LaunchRun } from "src/models/launch-run";
import { TopbarService } from "src/services/topbar.service";
import { launchSource } from "src/utils/launch-source";
import { LaunchState, NodeProgress } from "src/utils/launch-state";

/** Remembers whether the card is open, per browser. */
export const LAUNCH_INFO_KEY = "launch_info";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(LAUNCH_INFO_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

/**
 * The Launch page's own parts (#377): breadcrumbs in the app top bar
 * (Pipelines > project > Launches > start time) and a collapsible card on the
 * canvas with when, by whom and how the Launch ran.
 */
@Component({
  selector: "app-launch-info",
  templateUrl: "./launch-info.component.html",
  styleUrls: ["./launch-info.component.scss"],
  imports: [DatePipe, RouterLink, TuiButton, TuiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaunchInfoComponent implements OnInit, OnDestroy {
  private readonly topbar = inject(TopbarService);

  readonly launch = input.required<Launch>();
  /** The state the canvas sees, as in the top bar pill. */
  readonly state = input<LaunchState | null>(null);
  /** The running or recorded duration, as in the top bar pill. */
  readonly elapsed = input<string | null>(null);
  /** The recorded run, once the Launch finished. */
  readonly run = input<LaunchRun | null>(null);
  readonly progress = input<NodeProgress | null>(null);

  @ViewChild("crumbs", { static: true })
  crumbsRef!: TemplateRef<unknown>;

  readonly expanded = signal(readExpanded());
  readonly copied = signal(false);
  readonly source = computed(() => launchSource(this.launch()));
  readonly errors = computed(() => this.launch().errors?.length ?? 0);

  ngOnInit() {
    this.topbar.set(this.crumbsRef);
  }

  ngOnDestroy() {
    this.topbar.clear(this.crumbsRef);
  }

  toggle() {
    const expanded = !this.expanded();
    this.expanded.set(expanded);
    try {
      localStorage.setItem(
        LAUNCH_INFO_KEY,
        expanded ? "expanded" : "collapsed",
      );
    } catch {
      // The state just lasts until reload.
    }
  }

  async copyId() {
    try {
      await navigator.clipboard.writeText(this.launch()._id);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // No clipboard access: the id stays selectable.
    }
  }
}
