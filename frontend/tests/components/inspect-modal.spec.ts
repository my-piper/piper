import { CommonModule } from "@angular/common";
import { Component, ChangeDetectionStrategy } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideTaiga } from "@taiga-ui/core";
import { InspectComponent } from "src/app/inspect/inspect.component";
import { ImageFallbackDirective } from "src/directives/image-fall-back.directive";
import { InspectDirective } from "src/directives/inspect";
import { Languages } from "src/enums/languages";
import { I18nPipe } from "src/pipes/i18n.pipe";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { openDialog, popupRoot } from "../helpers/taiga";

const IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

@Component({
  selector: "app-inspect-host",
  template: `<div>
    <img [inspect]="{ type: 'image', url: image }" [src]="image" />
  </div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
class InspectHost {
  image = IMAGE;
}

async function render() {
  await TestBed.configureTestingModule({
    declarations: [
      InspectHost,
      InspectDirective,
      InspectComponent,
      ImageFallbackDirective,
      I18nPipe,
    ],
    imports: [CommonModule],
    providers: [
      provideTaiga(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(InspectHost);
  fixture.detectChanges();
  // the dialog renders into the portal of a tui-root
  const root = popupRoot();
  return { fixture, root };
}

describe("InspectDirective", () => {
  it("opens the source in a dialog and closes it", async () => {
    const { fixture, root } = await render();
    const element: HTMLElement = fixture.nativeElement;

    (element.querySelector("div > button") as HTMLButtonElement).click();
    root.detectChanges();
    const title = openDialog().querySelector("header").textContent;
    const image =
      openDialog().querySelector<HTMLImageElement>("app-inspect img");
    Array.from(openDialog().querySelectorAll("button"))
      .find((b) => b.textContent.trim() === "Close")
      .click();

    expect(title.trim()).toBe("Inspect");
    expect(image.getAttribute("src")).toBe(IMAGE);
    await expect
      .poll(() => {
        root.detectChanges();
        return openDialog();
      })
      .toBeNull();
  });
});
