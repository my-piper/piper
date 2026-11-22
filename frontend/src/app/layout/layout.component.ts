import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRouteSnapshot, NavigationEnd, Router } from "@angular/router";
import { TUI_BREAKPOINT } from "@taiga-ui/core";
import { filter, map } from "rxjs";
import { ASIDE_EXPANDED_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import { UserRole } from "src/models/user";

/** True when the route or one of its active children asks for `data.fullBleed`. */
function isFullBleed(route: ActivatedRouteSnapshot | null): boolean {
  for (let current = route; current; current = current.firstChild) {
    if (current.data?.["fullBleed"]) {
      return true;
    }
  }
  return false;
}

function readExpanded(): boolean {
  try {
    return localStorage.getItem(ASIDE_EXPANDED_KEY) !== "false";
  } catch {
    return true;
  }
}

function storeExpanded(expanded: boolean) {
  try {
    localStorage.setItem(ASIDE_EXPANDED_KEY, String(expanded));
  } catch {
    // Storage is a convenience: the aside still toggles without it.
  }
}

/**
 * The frame of every signed-in page: Taiga's navigation header, the aside with
 * the global sections, and the main area the routed page renders into.
 * Routes that need the whole width (canvases) set `data: { fullBleed: true }`.
 */
@Component({
  selector: "app-layout",
  templateUrl: "./layout.template.html",
  styleUrls: ["./layout.template.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  encapsulation: ViewEncapsulation.None,
  standalone: false,
  host: { "[class.ready]": "ready()" },
})
export class AppLayoutComponent {
  private readonly router = inject(Router);
  private readonly breakpoint = inject(TUI_BREAKPOINT);

  readonly appConfig = inject(AppConfig);
  readonly userRole = UserRole;
  readonly expanded = signal(readExpanded());
  /** On phones the aside gives way to a drawer opened from the header. */
  readonly mobile = computed(() => this.breakpoint() === "mobile");
  /** Closed after every navigation and whenever the viewport leaves mobile. */
  readonly drawerOpen = signal(false);
  private readonly navigated = this.router.events.pipe(
    filter((event) => event instanceof NavigationEnd),
  );
  readonly fullBleed = toSignal(
    this.navigated.pipe(
      map(() => isFullBleed(this.router.routerState.snapshot.root)),
    ),
    { initialValue: isFullBleed(this.router.routerState.snapshot.root) },
  );

  /** Off until the first paint, so the aside doesn't animate open on load. */
  readonly ready = signal(false);

  constructor() {
    afterNextRender(() => requestAnimationFrame(() => this.ready.set(true)));
    this.navigated
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.drawerOpen.set(false));
    effect(() => {
      if (!this.mobile()) {
        this.drawerOpen.set(false);
      }
    });
  }

  toggleAside() {
    this.expanded.update((expanded) => !expanded);
    storeExpanded(this.expanded());
  }
}
