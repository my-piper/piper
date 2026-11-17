import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { UI } from "src/consts/ui";

@Component({
  selector: "app-spinner",
  templateUrl: "./spinner.component.html",
  styleUrls: ["./spinner.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SpinnerComponent {
  @Input()
  size: string = "normal";

  @Input()
  color: string = UI.color.white;
}
