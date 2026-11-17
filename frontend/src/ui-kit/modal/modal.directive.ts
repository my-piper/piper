import { Directive, HostListener, Input, TemplateRef } from "@angular/core";
import { ModalService } from "./modal.service";
import { ModalOptions } from "./modal.types";

@Directive({
  selector: "[appModal]",
  exportAs: "appModal",
  standalone: false,
})
export class ModalDirective {
  @Input("appModal")
  options: Partial<ModalOptions> & { content: TemplateRef<any> };

  constructor(private modal: ModalService) {}

  @HostListener("click")
  click() {
    this.modal.open(this.options.content, this.options);
  }
}
