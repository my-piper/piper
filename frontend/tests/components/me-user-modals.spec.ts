import { CommonModule } from "@angular/common";
import { provideHttpClient, withXhr } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { Component, ChangeDetectionStrategy } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { ReactiveFormsModule } from "@angular/forms";
import { TuiButton, TuiDataList, TuiDropdown, TuiIcon } from "@taiga-ui/core";
import { provideRouter } from "@angular/router";
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

async function render() {
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
      CommonModule,
      ReactiveFormsModule,
      TaigaFormsModule,
      TuiButton,
      TuiIcon,
      ...TuiDataList,
      ...TuiDropdown,
    ],
    providers: [
      provideTestConfig(),
      provideValidationErrors(),
      provideSocketDouble(),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MeUserHost);
  fixture.detectChanges();
  const meUser = fixture.debugElement.query(By.directive(MeUserComponent))
    .componentInstance as MeUserComponent;
  const modal = fixture.debugElement.query(By.directive(ModalComponent))
    .componentInstance as ModalComponent;
  return { fixture, meUser, modal };
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
});
