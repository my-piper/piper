import { Directive, Input, TemplateRef, ViewContainerRef } from "@angular/core";

@Directive({
  selector: "[ngLet]",
  standalone: false,
})
export class LetDirective {
  public context: any = {};

  @Input()
  set ngLet(value: any) {
    this.context.$implicit = this.context.ngLet = value;
  }

  constructor(
    private view: ViewContainerRef,
    private template: TemplateRef<any>,
  ) {
    this.view.createEmbeddedView(this.template, this.context);
  }
}
