import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from "@angular/router";
import {
  TUI_DIALOGS_CLOSE,
  TuiDialog,
  TuiDialogService,
  TuiSizeL,
  TuiSizeS,
} from "@taiga-ui/core";
import { EMPTY, filter } from "rxjs";
import { dialogLabel, dialogSize } from "src/utils/route-dialog";

/**
 * Shows the host route's child routes in a `tuiDialog` (docs/design.md#dialogs,
 * #348). The dialog is open while a child route is active, takes its label
 * from the child's `data.dialogLabel` (and its size from `data.dialogSize`,
 * when set), and closing it navigates back to the
 * host route.
 */
@Component({
  selector: "app-routed-dialog",
  imports: [RouterOutlet, TuiDialog],
  templateUrl: "./routed-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    // Keep the child router context and let the route control the dialog lifetime.
    TuiDialogService,
    { provide: TUI_DIALOGS_CLOSE, useValue: EMPTY },
  ],
})
export class RoutedDialogComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly size = input<TuiSizeS | TuiSizeL>("l");
  /** Whether Esc and a click outside close it; off for forms. */
  readonly dismissible = input(true);
  /** Whether closing keeps the query, for a host that filters by it. */
  readonly keepQuery = input(false);

  /** The component the child route rendered. */
  readonly activate = output<unknown>();

  // the root popup host must exist before opening a dialog on direct route entry
  private readonly ready = signal(false);
  // signals rather than getters over route.firstChild, so OnPush re-renders
  // when navigation opens, closes or changes the child route
  private readonly childActive = signal(false);
  private readonly label = signal<string | undefined>(undefined);
  private readonly childSize = signal<TuiSizeS | TuiSizeL | undefined>(
    undefined,
  );

  readonly open = computed(() => this.ready() && this.childActive());
  readonly options = computed(() => ({
    size: this.childSize() ?? this.size(),
    dismissible: this.dismissible(),
    label: this.label(),
  }));

  constructor() {
    afterNextRender(() => this.ready.set(true));
    this.update();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.update());
  }

  private update() {
    const active = !!this.route.firstChild;
    this.childActive.set(active);
    this.label.set(active ? dialogLabel(this.route) : undefined);
    this.childSize.set(dialogSize(this.route));
  }

  close() {
    this.router.navigate(["./"], {
      relativeTo: this.route,
      queryParamsHandling: this.keepQuery() ? "preserve" : null,
    });
  }
}
