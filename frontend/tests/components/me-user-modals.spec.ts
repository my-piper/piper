import { CommonModule } from "@angular/common";
import { provideHttpClient, withXhr } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { Component, ChangeDetectionStrategy } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { ReactiveFormsModule } from "@angular/forms";
import {
  provideTaiga,
  TuiButton,
  TuiDataList,
  TuiDialog,
  TuiDropdown,
  TuiIcon,
} from "@taiga-ui/core";
import { provideRouter, Router } from "@angular/router";
import { ConnectedAccountsComponent } from "src/app/connected-accounts/connected-accounts.component";
import { User } from "src/models/user";
import { MeManager } from "src/services/me.service";
import { toInstance } from "src/utils/models";
import { userPlain } from "../fixtures/plain";
import { PlainAppConfig } from "../fixtures/runtime-config";
import { openDialog, popupRoot } from "../helpers/taiga";
import { ChangePasswordComponent } from "src/app/change-password/change-password.component";
import { MeUserComponent } from "src/app/me-user/me-user.component";
import { Languages } from "src/enums/languages";
import { I18nPipe } from "src/pipes/i18n.pipe";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { provideValidationErrors } from "src/providers/validation-errors";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { ErrorDialogComponent } from "src/app/error-dialog/error-dialog.component";
import { ModalComponent } from "src/ui-kit/modal/modal.component";
import { provideTestConfig } from "../helpers/config";
import { provideSocketDouble } from "../helpers/socket";

@Component({
  selector: "app-me-user-host",
  template: `<app-modal></app-modal><app-me-user></app-me-user>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
class MeUserHost {}

async function render(
  config: Partial<PlainAppConfig> = {},
  url: string | null = null,
) {
  await TestBed.configureTestingModule({
    declarations: [
      MeUserHost,
      MeUserComponent,
      ModalComponent,
      ChangePasswordComponent,
      I18nPipe,
    ],
    imports: [
      ErrorDialogComponent,
      ConnectedAccountsComponent,
      TuiDialog,
      CommonModule,
      ReactiveFormsModule,
      TaigaFormsModule,
      TuiButton,
      TuiIcon,
      ...TuiDataList,
      ...TuiDropdown,
    ],
    providers: [
      provideTaiga(),
      provideTestConfig(config),
      provideValidationErrors(),
      provideSocketDouble(),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
    ],
  }).compileComponents();
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
  if (url) {
    vi.spyOn(router, "url", "get").mockReturnValue(url);
  }
  const fixture = TestBed.createComponent(MeUserHost);
  // Before the first change detection: an `?sso=` result opens a dialog.
  const root = popupRoot();
  fixture.detectChanges();
  const meUser = fixture.debugElement.query(By.directive(MeUserComponent))
    .componentInstance as MeUserComponent;
  const modal = fixture.debugElement.query(By.directive(ModalComponent))
    .componentInstance as ModalComponent;
  return { fixture, meUser, modal, root, navigate };
}

function modalTitle(element: HTMLElement) {
  return element.querySelector("app-modal header h1")?.textContent.trim();
}

describe("MeUserComponent modals", () => {
  it("opens change password and closes once it is changed", async () => {
    const { fixture, meUser, modal } = await render();

    meUser.changePassword();
    fixture.detectChanges();
    const opened = fixture.debugElement.query(
      By.directive(ChangePasswordComponent),
    );
    const title = modalTitle(fixture.nativeElement);
    (opened.componentInstance as ChangePasswordComponent).changed.emit();
    fixture.detectChanges();

    expect(title).toBe("Change password");
    expect(modal.opened).toBe(false);
  });

  it("offers to set a password to a user without one", async () => {
    const { fixture, meUser } = await render();
    TestBed.inject(MeManager).user$.next(
      toInstance({ ...userPlain(), hasPassword: false }, User),
    );

    meUser.changePassword();
    fixture.detectChanges();

    expect(modalTitle(fixture.nativeElement)).toBe("Set password");
  });

  it("opens connected accounts after an account was connected", async () => {
    const reload = vi.spyOn(MeManager.prototype, "reload");

    const { fixture, root, meUser, navigate } = await render(
      { ui: { features: ["oidc_auth"], oidcLabel: "Authentik" } },
      "/projects?sso=linked",
    );
    fixture.detectChanges();
    root.detectChanges();

    expect(meUser.accountsOpen).toBe(true);
    expect(openDialog().textContent).toContain("Connected accounts");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { sso: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  });

  it("explains why connecting an account failed", async () => {
    const { fixture, root, meUser } = await render(
      { ui: { features: ["oidc_auth"], oidcLabel: "Authentik" } },
      "/projects?sso=sso_linked_elsewhere",
    );
    fixture.detectChanges();
    root.detectChanges();

    expect(meUser.accountsOpen).toBe(false);
    expect(openDialog().textContent).toContain(
      "This Authentik account is already connected to another user.",
    );
  });
});
