import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Inject,
  InjectionToken,
  Injector,
  Input,
  Optional,
  Output,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Languages } from "src/enums/languages";
import { I18nPipe } from "src/pipes/i18n.pipe";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { IconComponent } from "src/ui-kit/icon/icon.component";
import { ModalComponent } from "src/ui-kit/modal/modal.component";
import { ModalService } from "src/ui-kit/modal/modal.service";

const GREETING = new InjectionToken<string>("greeting");

@Component({
  selector: "app-modal-content-double",
  template: `<p class="label">{{ label }}</p>
    <p class="greeting">{{ greeting }}</p>
    <button class="done" (click)="done.emit()">Done</button>`,
  standalone: true,
})
class ModalContentDouble {
  @Input()
  label: string;

  @Output()
  done = new EventEmitter<void>();

  constructor(@Optional() @Inject(GREETING) public greeting: string) {}
}

async function render() {
  await TestBed.configureTestingModule({
    declarations: [ModalComponent, IconComponent, I18nPipe],
    imports: [CommonModule],
    providers: [{ provide: CURRENT_LANGUAGE, useValue: Languages.en }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ModalComponent);
  fixture.detectChanges();
  return { fixture, modal: TestBed.inject(ModalService) };
}

describe("ModalService.openComponent", () => {
  it("opens the component with its inputs and title", async () => {
    const { fixture, modal } = await render();

    modal.openComponent(ModalContentDouble, {
      title: "Inspect",
      inputs: { label: "Hello" },
    });
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector("header h1").textContent.trim()).toBe(
      "Inspect",
    );
    expect(element.querySelector(".content .label").textContent).toBe("Hello");
  });

  it("returns the component ref so an output can close the modal", async () => {
    const { fixture, modal } = await render();
    const closed = vi.fn();
    const ref = modal.openComponent(ModalContentDouble, { closed });
    ref.instance.done.subscribe(() => modal.close());
    fixture.detectChanges();

    (fixture.nativeElement.querySelector("button.done") as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.opened).toBe(false);
    expect(closed).toHaveBeenCalledWith("default");
    expect(fixture.nativeElement.querySelector(".ui-modal")).toBeNull();
  });

  it("resolves dependencies through the caller's injector when given", async () => {
    const { fixture, modal } = await render();
    const injector = Injector.create({
      providers: [{ provide: GREETING, useValue: "from caller" }],
      parent: TestBed.inject(Injector),
    });

    modal.openComponent(ModalContentDouble, { injector });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(".content .greeting").textContent,
    ).toBe("from caller");
  });
});
