import { Component, Type } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { tuiValidationErrorsProvider } from "@taiga-ui/core";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { provideValidationErrors } from "src/providers/validation-errors";
import {
  activeSegment,
  fieldError,
  pickSegment,
  segmentLabels,
  togglePassword,
} from "../helpers/taiga";

/** A form built the way the app's forms use the shared Taiga form setup. */
@Component({
  selector: "app-test-form",
  imports: [ReactiveFormsModule, TaigaFormsModule],
  template: `
    <form [formGroup]="form">
      <tui-textfield data-test="password">
        <label tuiLabel>Password</label>
        <input formControlName="password" tuiInput type="password" />
        <tui-icon tuiPassword />
      </tui-textfield>
      <tui-error data-test="password-error" formControlName="password" />
      <tui-textfield>
        <input formControlName="name" tuiInput />
      </tui-textfield>
      <tui-error data-test="name-error" formControlName="name" />
      <tui-segmented>
        <label>
          <input formControlName="mode" type="radio" value="script" />
          Script
        </label>
        <label>
          <input formControlName="mode" type="radio" value="code" />
          Code
        </label>
      </tui-segmented>
    </form>
  `,
})
class TestFormComponent {
  form = new FormBuilder().group({
    password: ["", [Validators.required, Validators.minLength(6)]],
    name: ["", [Validators.required]],
    mode: ["script"],
  });
}

/** The same form with a local message overriding the global one. */
@Component({
  selector: "app-test-overriding-form",
  imports: [ReactiveFormsModule, TaigaFormsModule],
  providers: [tuiValidationErrorsProvider({ required: "Name the project." })],
  template: `
    <form [formGroup]="form">
      <tui-textfield>
        <input formControlName="name" tuiInput />
      </tui-textfield>
      <tui-error data-test="name-error" formControlName="name" />
    </form>
  `,
})
class TestOverridingFormComponent {
  form = new FormBuilder().group({ name: ["", [Validators.required]] });
}

async function render<T>(component: Type<T>) {
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [provideValidationErrors()],
  }).compileComponents();
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture;
}

function query(fixture: { nativeElement: HTMLElement }, id: string) {
  return fixture.nativeElement.querySelector(`[data-test="${id}"]`);
}

describe("shared Taiga form setup", () => {
  it("shows no message before the field is touched", async () => {
    const fixture = await render(TestFormComponent);

    expect(fieldError(query(fixture, "name-error"))).toBe("");
  });

  it("shows the global message for a touched invalid field", async () => {
    const fixture = await render(TestFormComponent);
    const { form } = fixture.componentInstance;

    form.controls.name.markAsTouched();
    fixture.detectChanges();

    expect(fieldError(query(fixture, "name-error"))).toBe(
      "This field is required.",
    );
  });

  it("fills the global minimum length message with the required length", async () => {
    const fixture = await render(TestFormComponent);
    const { form } = fixture.componentInstance;

    form.controls.password.setValue("abc");
    form.controls.password.markAsTouched();
    fixture.detectChanges();

    expect(fieldError(query(fixture, "password-error"))).toBe(
      "Min length 6 characters.",
    );
  });

  it("lets a form override a global message", async () => {
    const fixture = await render(TestOverridingFormComponent);
    const { form } = fixture.componentInstance;

    form.controls.name.markAsTouched();
    fixture.detectChanges();

    expect(fieldError(query(fixture, "name-error"))).toBe("Name the project.");
  });

  it("toggles a password field between hidden and shown", async () => {
    const fixture = await render(TestFormComponent);
    const textfield = query(fixture, "password");
    const input = textfield.querySelector("input");

    togglePassword(textfield);
    fixture.detectChanges();
    const shown = input.type;
    togglePassword(textfield);
    fixture.detectChanges();

    expect([shown, input.type]).toEqual(["text", "password"]);
  });

  it("binds a segmented control to its form control", async () => {
    const fixture = await render(TestFormComponent);
    const segmented = fixture.nativeElement.querySelector("tui-segmented");

    pickSegment(segmented, "Code");
    fixture.detectChanges();

    expect(segmentLabels(segmented)).toEqual(["Script", "Code"]);
    expect(fixture.componentInstance.form.value.mode).toBe("code");
    expect(activeSegment(segmented)).toBe("Code");
  });
});
