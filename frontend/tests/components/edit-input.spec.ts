import { HttpTestingController } from "@angular/common/http/testing";
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { fakeAsync, TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";
import { AppModule } from "src/app/app.module";
import { configureAppTestingModule, finish } from "../helpers/editor";

/** An enum option is `value|label`; a bare value is its own label. */
const COLORS = ["red|Red", "green|Green", "blue", "#000080|Navy"];

/**
 * A freeform string input with an enum, as the playground and node inputs
 * render it. `<tui-root>` hosts the dropdown Taiga opens for the suggestions.
 */
@Component({
  selector: "app-edit-input-host",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <tui-root>
      <app-edit-input
        type="string"
        label="Color"
        [freeform]="true"
        [enum]="colors"
        [formControl]="control"
      ></app-edit-input>
    </tui-root>
  `,
})
class EditInputHostComponent {
  colors = COLORS;
  control = new FormControl<string>(null);
}

function setup() {
  TestBed.overrideModule(AppModule, {
    add: { declarations: [EditInputHostComponent] },
  });
  configureAppTestingModule();
  const fixture = TestBed.createComponent(EditInputHostComponent);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const input = element.querySelector<HTMLInputElement>("app-edit-input input");

  return {
    fixture,
    control: fixture.componentInstance.control,
    input,
    /** Opens the suggestions with ArrowDown, as a keyboard user would. */
    open: () => {
      input.focus();
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      fixture.detectChanges();
    },
    /** Leaves the field, which closes the suggestions. */
    close: () => {
      input.blur();
      fixture.detectChanges();
    },
    type: (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event("input"));
      fixture.detectChanges();
    },
  };
}

/** The suggestions of the open dropdown, which Taiga renders in its portal. */
function suggestions(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "tui-dropdown:not(.tui-leave) [tuiOption]",
    ),
  );
}

function labels(): string[] {
  return suggestions().map((option) => option.textContent.trim());
}

describe("EditInputComponent suggestions", () => {
  it("suggests every option by its label", fakeAsync(() => {
    const page = setup();

    page.open();

    expect(labels()).toEqual(["Red", "Green", "blue", "Navy"]);
    page.close();
    page.fixture.destroy();
    finish();
  }));

  it("narrows the suggestions to the typed text", fakeAsync(() => {
    const page = setup();
    page.open();

    page.type("gr");

    expect(labels()).toEqual(["Green"]);
    page.close();
    page.fixture.destroy();
    finish();
  }));

  it("finds an option by its value as well as its label", fakeAsync(() => {
    const page = setup();
    page.open();

    page.type("#0000");

    expect(labels()).toEqual(["Navy"]);
    page.close();
    page.fixture.destroy();
    finish();
  }));

  it("puts a picked suggestion's value into the field", fakeAsync(() => {
    const page = setup();
    page.open();

    suggestions()
      .find((option) => option.textContent.trim() === "Green")
      .click();
    page.fixture.detectChanges();

    expect(page.input.value).toBe("green");
    expect(page.control.value).toBe("green");
    expect(labels()).toEqual([]);
    page.fixture.destroy();
    finish();
  }));

  it("keeps free text that matches no option", fakeAsync(() => {
    const page = setup();
    page.open();

    page.type("purple");

    expect(page.input.value).toBe("purple");
    expect(page.control.value).toBe("purple");
    expect(labels()).toEqual([]);
    page.fixture.destroy();
    finish();
  }));
});

/** An image input; its asset picker opens in the app's modal. */
@Component({
  selector: "app-edit-image-input-host",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <tui-root>
      <app-modal></app-modal>
      <app-edit-input
        type="image"
        label="Picture"
        [formControl]="control"
      ></app-edit-input>
    </tui-root>
  `,
})
class EditImageInputHostComponent {
  control = new FormControl<string>(null);
}

describe("EditInputComponent asset picker", () => {
  function setupPicker() {
    TestBed.overrideModule(AppModule, {
      add: { declarations: [EditImageInputHostComponent] },
    });
    configureAppTestingModule();
    const fixture = TestBed.createComponent(EditImageInputHostComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    return {
      fixture,
      element,
      openPicker: () => {
        element.querySelector<HTMLElement>("app-edit-input .container").click();
        fixture.detectChanges();
      },
      /** A tab of the picker, found by its label whatever renders the tab bar. */
      tab: (label: string) =>
        Array.from(
          element.querySelectorAll<HTMLElement>(
            "app-modal a, app-modal button",
          ),
        ).find((t) => t.textContent.trim() === label),
    };
  }

  it("shows generated artefacts first and switches to the assets", fakeAsync(() => {
    const page = setupPicker();
    page.openPicker();

    expect(page.tab("Generated")).toBeTruthy();
    expect(
      page.element.querySelector("app-modal app-artefacts"),
    ).not.toBeNull();
    expect(page.element.querySelector("app-modal app-assets")).toBeNull();

    page.tab("Assets").click();
    page.fixture.detectChanges();

    expect(page.element.querySelector("app-modal app-assets")).not.toBeNull();
    expect(page.element.querySelector("app-modal app-artefacts")).toBeNull();
    TestBed.inject(HttpTestingController)
      .match(() => true)
      .forEach((r) => r.flush([]));
    page.fixture.destroy();
    finish();
  }));
});
