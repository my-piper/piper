import { TestBed } from "@angular/core/testing";
import { SelectThemeComponent } from "src/app/select-theme/select-theme.component";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { THEME_KEY } from "src/consts/core";
import { activeSegment, pickSegment, segmentLabels } from "../helpers/taiga";

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function render() {
  await TestBed.configureTestingModule({
    declarations: [SelectThemeComponent],
    imports: [TaigaFormsModule],
  }).compileComponents();
  const fixture = TestBed.createComponent(SelectThemeComponent);
  fixture.detectChanges();
  // Labels from an @for are created after tui-segmented reads
  // [activeItemIndex]; its ResizeObserver marks the item on a later frame.
  await nextFrame();
  await nextFrame();
  const segmented = (fixture.nativeElement as HTMLElement).querySelector(
    "tui-segmented",
  );
  return { fixture, segmented };
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

    const { segmented } = await render();

    expect(segmentLabels(segmented)).toEqual(["Light", "Dark", "System"]);
    expect(activeSegment(segmented)).toBe("Dark");
  });

  it("switches the document theme when an option is picked", async () => {
    localStorage.setItem(THEME_KEY, "dark");
    const { fixture, segmented } = await render();

    pickSegment(segmented, "Light");
    fixture.detectChanges();

    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(activeSegment(segmented)).toBe("Light");
  });
});
