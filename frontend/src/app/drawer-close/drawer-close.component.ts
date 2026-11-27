import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { TuiButton } from "@taiga-ui/core";

/**
 * The close button at the end of a canvas drawer's header: clears the named
 * outlet the drawer's component is routed into.
 */
@Component({
  selector: "app-drawer-close",
  template: `<button
    tuiIconButton
    appearance="flat-grayscale"
    size="s"
    type="button"
    iconStart="@tui.x"
    data-testid="drawer-close"
    aria-label="Close"
    i18n-aria-label="@@action.close"
    (click)="close()"
  ></button>`,
  imports: [TuiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerCloseComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly outlet = input.required<"left" | "right">();

  close() {
    this.router.navigate([{ outlets: { [this.outlet()]: null } }], {
      relativeTo: this.route.parent,
    });
  }
}
