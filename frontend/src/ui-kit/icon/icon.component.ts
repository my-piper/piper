import {
  Component,
  HostBinding,
  Input,
  ChangeDetectionStrategy,
} from "@angular/core";

@Component({
  selector: "app-icon",
  templateUrl: "./icon.component.html",
  styleUrls: ["./icon.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class IconComponent {
  @Input()
  icon!: string;

  @HostBinding("style.min-width.px")
  @HostBinding("style.min-height.px")
  @HostBinding("style.width.px")
  @HostBinding("style.height.px")
  @Input()
  size: number = 22;

  @Input()
  color = "var(--icon-color)";

  @HostBinding("attr.data-stroke")
  @Input()
  stroke = 1;
}
