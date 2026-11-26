import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  OnInit,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router } from "@angular/router";
import { filter, startWith } from "rxjs";
import { SSO_LINKED, ssoErrorMessage } from "src/consts/sso";
import { AppError } from "src/models/errors";
import { AppConfig } from "src/models/app-config";
import { HttpService } from "src/services/http.service";
import { MeManager } from "src/services/me.service";
import { ModalService } from "../../ui-kit/modal/modal.service";
import { ChangePasswordComponent } from "../change-password/change-password.component";

@Component({
  selector: "app-me-user",
  templateUrl: "./me-user.component.html",
  styleUrls: ["./me-user.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class MeUserComponent implements OnInit {
  menuOpen = false;
  accountsOpen = false;
  ssoError: AppError | null = null;
  readonly connectedAccountsLabel = $localize`:@@label.connected_accounts:Connected accounts`;

  private readonly destroyRef = inject(DestroyRef);

  get ssoEnabled(): boolean {
    return !!this.config.ui?.features?.includes("oidc_auth");
  }

  constructor(
    public me: MeManager,
    public config: AppConfig,
    private modal: ModalService,
    private router: Router,
    private http: HttpService,
  ) {}

  ngOnInit() {
    // Connecting an account ends in a full-page redirect to `?sso=<result>`.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.showSsoResult());
  }

  connectedAccounts() {
    this.menuOpen = false;
    this.accountsOpen = true;
  }

  private showSsoResult() {
    const result = this.router
      .parseUrl(this.router.url)
      .queryParamMap.get("sso");
    if (!result) {
      return;
    }

    if (result === SSO_LINKED) {
      this.me.reload();
      this.accountsOpen = true;
    } else {
      this.ssoError = new AppError(
        ssoErrorMessage(result, this.config.ui?.oidcLabel || "SSO"),
      );
    }
    this.router.navigate([], {
      queryParams: { sso: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  changePassword() {
    this.menuOpen = false;
    const component = this.modal.openComponent(ChangePasswordComponent, {
      title:
        this.me.user?.hasPassword === false
          ? $localize`:@@label.set_password:Set password`
          : $localize`:@@label.change_password:Change password`,
    });
    component.instance.changed.subscribe(() => this.me.reload());
    component.instance.changed.subscribe(() => this.modal.close());
  }

  logout() {
    this.menuOpen = false;
    this.config.authorization = null;
    this.router.navigate(["/login"]);
  }
}
