import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { ChangePasswordComponent } from "src/app/change-password/change-password.component";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { provideValidationErrors } from "src/providers/validation-errors";
import { InformerComponent } from "src/ui-kit/informer/informer.component";
import { IconComponent } from "src/ui-kit/icon/icon.component";
import { provideTestConfig } from "../helpers/config";
import { fieldError, markedInvalid } from "../helpers/taiga";

async function render() {
  await TestBed.configureTestingModule({
    declarations: [ChangePasswordComponent, InformerComponent, IconComponent],
    imports: [ReactiveFormsModule, TaigaFormsModule],
    providers: [
      provideTestConfig(),
      provideValidationErrors(),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ChangePasswordComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const [password, confirmPassword] = Array.from(
    element.querySelectorAll<HTMLInputElement>("input"),
  );
  const [passwordError, mismatchError] = Array.from(
    element.querySelectorAll("tui-error"),
  );

  return {
    fixture,
    password,
    confirmPassword,
    passwordError,
    mismatchError,
    controller: TestBed.inject(HttpTestingController),
    type(input: HTMLInputElement, value: string) {
      input.value = value;
      input.dispatchEvent(new Event("input"));
    },
    submit() {
      element.querySelector("form").dispatchEvent(new Event("submit"));
      fixture.detectChanges();
    },
  };
}

describe("ChangePasswordComponent", () => {
  it("shows no errors before submitting", async () => {
    const { passwordError, mismatchError, password } = await render();

    expect(fieldError(passwordError)).toBe("");
    expect(fieldError(mismatchError)).toBe("");
    expect(markedInvalid(password)).toBe(false);
  });

  it("asks for a longer password and does not submit", async () => {
    const page = await render();
    page.type(page.password, "abc");
    page.type(page.confirmPassword, "abc");

    page.submit();

    expect(fieldError(page.passwordError)).toBe("Min length 6 characters.");
    expect(markedInvalid(page.password)).toBe(true);
    expect(fieldError(page.mismatchError)).toBe("");
    page.controller.verify();
  });

  it("says the passwords do not match and does not submit", async () => {
    const page = await render();
    page.type(page.password, "secret1");
    page.type(page.confirmPassword, "secret2");

    page.submit();

    expect(fieldError(page.passwordError)).toBe("");
    expect(fieldError(page.mismatchError)).toBe("Passwords do not match.");
    page.controller.verify();
  });

  it("submits matching passwords", async () => {
    const page = await render();
    page.type(page.password, "secret1");
    page.type(page.confirmPassword, "secret1");

    page.submit();

    const req = page.controller.expectOne("/api/me/change-password");
    expect(req.request.method).toBe("POST");
    expect(fieldError(page.mismatchError)).toBe("");
  });
});
