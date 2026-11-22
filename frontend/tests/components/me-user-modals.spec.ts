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
import { NsfwDisclaimer } from "src/app/nsfw-disclaimer/nsfw-disclaimer.component";
import { Languages } from "src/enums/languages";
import { I18nPipe } from "src/pipes/i18n.pipe";
import { InvalidFieldPipe } from "src/pipes/invalid-field.pipe";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { IconComponent } from "src/ui-kit/icon/icon.component";
import { InformerComponent } from "src/ui-kit/informer/informer.component";
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
      NsfwDisclaimer,
      IconComponent,
      InformerComponent,
      I18nPipe,
      InvalidFieldPipe,
    ],
    imports: [
      CommonModule,
      ReactiveFormsModule,
      TuiButton,
      TuiIcon,
      ...TuiDataList,
      ...TuiDropdown,
    ],
    providers: [
      provideTestConfig(),
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

  it("allows NSFW once the disclaimer is agreed", async () => {
    const { fixture, meUser, modal } = await render();

    meUser.nsfwControl.setValue(true);
    fixture.detectChanges();
    const title = modalTitle(fixture.nativeElement);
    (
      fixture.nativeElement.querySelector(
        "app-nsfw-disclaimer button.primary",
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(title).toBe("NSFW disclaimer");
    expect(localStorage.getItem("nsfw")).toBe("allow");
    expect(modal.opened).toBe(false);
    expect(meUser.nsfwControl.value).toBe(true);
  });

  it("switches NSFW back off when the user dismisses the disclaimer", async () => {
    const { fixture, meUser, modal } = await render();

    meUser.nsfwControl.setValue(true);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        "app-modal header button.close",
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(modal.opened).toBe(false);
    expect(meUser.nsfwControl.value).toBe(false);
    expect(localStorage.getItem("nsfw")).toBeNull();
  });
});
