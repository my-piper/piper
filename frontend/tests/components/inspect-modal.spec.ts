import { CommonModule } from "@angular/common";
import { Component, ChangeDetectionStrategy } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { InspectComponent } from "src/app/inspect/inspect.component";
import { ImageFallbackDirective } from "src/directives/image-fall-back.directive";
import { InspectDirective } from "src/directives/inspect";
import { Languages } from "src/enums/languages";
import { I18nPipe } from "src/pipes/i18n.pipe";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { IconComponent } from "src/ui-kit/icon/icon.component";
import { ModalComponent } from "src/ui-kit/modal/modal.component";

const IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

@Component({
  selector: "app-inspect-host",
  template: `<app-modal></app-modal>
    <div><img [inspect]="{ type: 'image', url: image }" [src]="image" /></div>`,
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
      ModalComponent,
      IconComponent,
      I18nPipe,
    ],
    imports: [CommonModule],
    providers: [{ provide: CURRENT_LANGUAGE, useValue: Languages.en }],
  }).compileComponents();
  const fixture = TestBed.createComponent(InspectHost);
  fixture.detectChanges();
  const modal = fixture.debugElement.query(By.directive(ModalComponent))
    .componentInstance as ModalComponent;
  return { fixture, modal };
}

describe("InspectDirective", () => {
  it("opens the source in the inspect modal and closes it", async () => {
    const { fixture, modal } = await render();
    const element: HTMLElement = fixture.nativeElement;

    (element.querySelector("div > button") as HTMLButtonElement).click();
    fixture.detectChanges();
    const title = element.querySelector("app-modal header h1").textContent;
    const image = element.querySelector<HTMLImageElement>("app-inspect img");
    (
      element.querySelector("app-modal header button.close") as HTMLElement
    ).click();
    fixture.detectChanges();

    expect(title.trim()).toBe("Inspect");
    expect(image.getAttribute("src")).toBe(IMAGE);
    expect(modal.opened).toBe(false);
    expect(element.querySelector("app-inspect")).toBeNull();
  });
});
