import { Component, Input, ChangeDetectionStrategy } from "@angular/core";

@Component({
  selector: "app-inspect",
  templateUrl: "./inspect.component.html",
  styleUrls: ["./inspect.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class InspectComponent {
  @Input()
  type: "image" | "video" | "text" | "markdown" = "image";

  @Input()
  url: string;

  @Input()
  text: string;
}
