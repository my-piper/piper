import { TestBed } from "@angular/core/testing";
import { SelectThemeComponent } from "src/app/select-theme/select-theme.component";
import { THEME_KEY } from "src/consts/core";

async function render() {
  await TestBed.configureTestingModule({
    declarations: [SelectThemeComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(SelectThemeComponent);
  fixture.detectChanges();
  return fixture;
}

function options(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLLabelElement>("label.option")
  );
}

describe("SelectThemeComponent", () => {
  let initialTheme: string | undefined;

  beforeEach(() => {
    initialTheme = document.documentElement.dataset["theme"];
  });

  afterEach(() => {
    document.documentElement.dataset["theme"] = initialTheme;
  });

  it("marks the stored mode as selected", async () => {
    localStorage.setItem(THEME_KEY, "dark");

    const fixture = await render();

    const selected = options(fixture.nativeElement).filter((option) =>
      option.classList.contains("selected")
    );
    expect(selected.map((option) => option.textContent.trim())).toEqual([
      "Dark",
    ]);
  });

  it("switches the document theme when an option is picked", async () => {
    localStorage.setItem(THEME_KEY, "dark");
    const fixture = await render();
    const light = options(fixture.nativeElement).find(
      (option) => option.textContent.trim() === "Light"
    );

    light.querySelector("input").click();
    fixture.detectChanges();

    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(light.classList.contains("selected")).toBeTrue();
  });
});
