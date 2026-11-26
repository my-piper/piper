import { AsyncPipe, DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { TuiButton } from "@taiga-ui/core";
import { TuiButtonLoading } from "@taiga-ui/kit";
import { finalize } from "rxjs";
import { ErrorDialogComponent } from "src/app/error-dialog/error-dialog.component";
import { AppConfig } from "src/models/app-config";
import { DisplayError } from "src/models/errors";
import { IdentityProvider, User, UserIdentity } from "src/models/user";
import { NAVIGATE_TO } from "src/providers/navigate";
import { HttpService } from "src/services/http.service";
import { MeManager } from "src/services/me.service";

/**
 * The single sign-on account connected to the current user: connect one, or
 * disconnect it unless it is the user's only way to sign in.
 */
@Component({
  selector: "app-connected-accounts",
  imports: [
    AsyncPipe,
    DatePipe,
    TuiButton,
    TuiButtonLoading,
    ErrorDialogComponent,
  ],
  templateUrl: "./connected-accounts.component.html",
  styleUrls: ["./connected-accounts.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountsComponent {
  readonly me = inject(MeManager);
  private readonly http = inject(HttpService);
  private readonly navigate = inject(NAVIGATE_TO);

  readonly label = inject(AppConfig).ui?.oidcLabel || "SSO";
  readonly progress = signal(false);
  readonly error = signal<DisplayError | null>(null);

  identity(user: User): UserIdentity | undefined {
    return user.identities?.find(
      ({ provider }) => provider === IdentityProvider.oidc,
    );
  }

  /** Disconnecting must leave a password or another account to sign in with. */
  canDisconnect(user: User): boolean {
    return !!user.hasPassword || (user.identities?.length ?? 0) > 1;
  }

  connect() {
    this.progress.set(true);
    // The response sets the link ticket as an HttpOnly cookie for the flow.
    this.http.post("me/identities/oidc/link", {}).subscribe({
      next: () => this.navigate("/oauth/oidc?link"),
      error: (err) => {
        this.progress.set(false);
        this.error.set(err);
      },
    });
  }

  disconnect() {
    this.progress.set(true);
    this.http
      .delete(`me/identities/${IdentityProvider.oidc}`)
      .pipe(finalize(() => this.progress.set(false)))
      .subscribe({
        next: () => this.me.reload(),
        error: (err) => this.error.set(err),
      });
  }
}
