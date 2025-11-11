import { Injectable } from "@angular/core";
import { DropZoneDirective } from "src/directives/drop-zone.directive";

function viewportToElementContentBox(
  el: HTMLElement,
  clientX: number,
  clientY: number
) {
  const r = el.getBoundingClientRect();
  const x = clientX - r.left + el.scrollLeft - el.clientLeft;
  const y = clientY - r.top + el.scrollTop - el.clientTop;
  return { x, y };
}

@Injectable({ providedIn: "root" })
export class DropZoneHub {
  zones = new Map<HTMLElement, DropZoneDirective>();

  register(zone: HTMLElement, directive: DropZoneDirective) {
    this.zones.set(zone, directive);
  }

  drop(hints: Element[], left: number, top: number, payload: any) {
    for (const e of hints) {
      const hint = e as HTMLElement;
      const directive = this.zones.get(hint as HTMLElement);
      if (!!directive) {
        const { x, y } = viewportToElementContentBox(hint, left, top);
        directive.drop.emit({ top: y, left: x, payload });
      }
    }
  }

  remove(zone: HTMLElement) {
    this.zones.delete(zone);
  }
}
