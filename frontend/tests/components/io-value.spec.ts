import { fakeAsync, TestBed } from "@angular/core/testing";
import { vi } from "vitest";
import { IoValueComponent } from "src/app/io-value/io-value.component";
import { configureAppTestingModule, finish } from "../helpers/editor";

function setup(io: object, value: unknown) {
  configureAppTestingModule();
  const fixture = TestBed.createComponent(IoValueComponent);
  fixture.componentRef.setInput("io", io);
  fixture.componentRef.setInput("value", value);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe("IoValueComponent", () => {
  it("copies a code value with its Copy button", fakeAsync(() => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const page = setup(
      { type: "string", format: "code", language: "javascript" },
      "return 1;",
    );
    const button = Array.from(page.element.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === "Copy",
    );

    button.click();

    expect(copy).toHaveBeenCalledExactlyOnceWith("return 1;");
    page.fixture.destroy();
    finish();
  }));

  it("shows a boolean as yes or no", fakeAsync(() => {
    const page = setup({ type: "boolean" }, true);

    expect(page.element.textContent.trim()).toBe("yes");
    expect(page.element.querySelector("button")).toBeNull();
    page.fixture.destroy();
    finish();
  }));
});
