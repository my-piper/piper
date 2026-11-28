import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRouteSnapshot, NavigationEnd, Router } from "@angular/router";
import { TUI_BREAKPOINT } from "@taiga-ui/core";
import { filter, map } from "rxjs";
import { SIDEBAR_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import { UserRole } from "src/models/user";
import { MeManager } from "src/services/me.service";
import { TopbarService } from "src/services/topbar.service";

/** A global section of the app: a sidebar item and the top bar's crumb. */
export type AppSection = {
  path: string;
  label: string;
  icon: string;
  admin?: boolean;
  /** Out of beta: the top bar crumb drops the "beta" badge. */
  stable?: boolean;
};

const SECTIONS: AppSection[] = [
  {
    path: "packages",
    label: $localize`:@@link.node_packages:Node packages`,
    icon: "@tui.package",
    admin: true,
  },
  {
    path: "projects",
    label: $localize`:@@link.pipelines:Pipelines`,
    icon: "@tui.workflow",
  },
  {
    path: "launches",
    label: $localize`:@@link.launches:Launches`,
    icon: "@tui.history",
    stable: true,
  },
  {
    path: "assets",
    label: $localize`:@@link.assets:Assets`,
    icon: "@tui.folder-open",
  },
  {
    path: "environment",
    label: $localize`:@@link.environment:Environment`,
    icon: "@tui.key-round",
  },
  {
    path: "users",
    label: $localize`:@@link.users:Users`,
    icon: "@tui.users",
    admin: true,
  },
];

/** True when the route or one of its active children asks for `data.fullBleed`. */
function isFullBleed(route: ActivatedRouteSnapshot | null): boolean {
  for (let current = route; current; current = current.firstChild) {
    if (current.data?.["fullBleed"]) {
      return true;
    }
  }
  return false;
}

/** Reads the stored sidebar state; storage can be unavailable. */
function readExpanded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "expanded";
  } catch {
    return false;
  }
}

/**
 * The frame of every signed-in page: a 48px icon sidebar (expandable to
 * labelled rows) with the global
 * sections, a 40px top bar with the current section, and the main area the
 * routed page renders into. Routes that need the whole width (canvases) set
 * `data: { fullBleed: true }`.
 */
@Component({
  selector: "app-layout",
  templateUrl: "./layout.template.html",
  styleUrls: ["./layout.template.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class AppLayoutComponent {
  private readonly router = inject(Router);
  private readonly breakpoint = inject(TUI_BREAKPOINT);
  private readonly me = inject(MeManager);

  readonly appConfig = inject(AppConfig);
  /** The page's own top bar content, when it has one. */
  readonly topbar = inject(TopbarService);
  /** On phones the sidebar gives way to a drawer opened from the top bar. */
  readonly mobile = computed(() => this.breakpoint() === "mobile");
  /** The desktop sidebar shows labels next to its icons. */
  readonly expanded = signal(readExpanded());
  readonly expandLabel = $localize`:@@label.expand_sidebar:Expand sidebar`;
  readonly collapseLabel = $localize`:@@label.collapse_sidebar:Collapse sidebar`;
  /** Closed after every navigation and whenever the viewport leaves mobile. */
  readonly drawerOpen = signal(false);
  private readonly navigated = this.router.events.pipe(
    filter((event) => event instanceof NavigationEnd),
  );
  private readonly url = toSignal(
    this.navigated.pipe(map(() => this.router.url)),
    { initialValue: this.router.url },
  );
  readonly fullBleed = toSignal(
    this.navigated.pipe(
      map(() => isFullBleed(this.router.routerState.snapshot.root)),
    ),
    { initialValue: isFullBleed(this.router.routerState.snapshot.root) },
  );

  private readonly user = toSignal(this.me.user$, {
    initialValue: this.me.user,
  });
  /** Admin sections only for admins. */
  readonly sections = computed(() => {
    const admin = !!this.user()?.roles?.includes(UserRole.admin);
    return SECTIONS.filter((section) => admin || !section.admin);
  });
  /** The section the current page belongs to, for the top bar. */
  readonly current = computed(() => {
    const [segment] = this.url()
      .split(/[/?#(;]/)
      .filter(Boolean);
    return this.sections().find(({ path }) => path === segment) ?? null;
  });

  toggleSidebar() {
    const expanded = !this.expanded();
    this.expanded.set(expanded);
    try {
      localStorage.setItem(SIDEBAR_KEY, expanded ? "expanded" : "collapsed");
    } catch {
      // The state just lasts until reload.
    }
  }

  constructor() {
    this.navigated
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.drawerOpen.set(false));
    effect(() => {
      if (!this.mobile()) {
        this.drawerOpen.set(false);
      }
    });
  }
}
