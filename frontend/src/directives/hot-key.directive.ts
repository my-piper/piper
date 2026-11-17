import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from "@angular/core";

@Directive({
  selector: "[hotKey]",
  standalone: false,
})
export class HotKeyDirective {
  @Input()
  hotKey!: string;

  @Output()
  hotKeyPressed = new EventEmitter<void>();

  constructor(private el: ElementRef) {}

  @HostListener("document:keydown", ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.isElementVisible()) {
      return;
    }

    for (const key of this.hotKey.split("+")) {
      if (key === "meta") {
        if (!event.metaKey) {
          return;
        }
      } else if (key === "ctrl") {
        if (!event.ctrlKey) {
          return;
        }
      } else if (key === "shift") {
        if (!event.shiftKey) {
          return;
        }
      } else if (key === "alt") {
        if (!event.altKey) {
          return;
        }
      } else if (event.key.toLowerCase() !== key.toLowerCase()) {
        return;
      }
    }

    this.hotKeyPressed.emit();
  }

  private isElementVisible(): boolean {
    const element = this.el.nativeElement as HTMLElement;
    return !!(
      element.offsetWidth ||
      element.offsetHeight ||
      element.getClientRects().length
    );
  }
}
