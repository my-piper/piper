import { Component, Input } from "@angular/core";

@Component({
  selector: "app-inspect",
  templateUrl: "./inspect.component.html",
  styleUrls: ["./inspect.component.scss"],
})
export class InspectComponent {
  @Input()
  type: "image" | "video" = "image";

  @Input()
  url: string;
}
