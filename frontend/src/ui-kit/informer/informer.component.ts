import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  Renderer2,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
} from "@angular/core";

@Component({
  selector: "app-informer",
  templateUrl: "./informer.component.html",
  styleUrls: ["./informer.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class InformerComponent {
  @Input()
  message!: string;

  @Input()
  contentTemplate: TemplateRef<any>;

  @ViewChild("okRef")
  okRef: ElementRef<HTMLButtonElement>;

  @Output()
  ok = new EventEmitter();

  constructor(private render: Renderer2) {}

  ngAfterViewInit() {
    if (!!this.okRef) {
      this.okRef.nativeElement.focus();
    }
  }
}
