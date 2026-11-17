import { Component, HostBinding, Input } from "@angular/core";
import { NodeInput, NodeOutput } from "src/models/node";
import { Primitive } from "src/types/primitive";

// Inputs carry `default`, outputs carry `format` and `language`; the template
// reads whichever is present and falls back to undefined otherwise.
type NodeIO = Pick<NodeInput | NodeOutput, "type"> &
  Partial<Pick<NodeInput, "default">> &
  Partial<Pick<NodeOutput, "format" | "language">>;

@Component({
  selector: "app-io-value",
  templateUrl: "./io-value.component.html",
  styleUrls: ["./io-value.component.scss"],
  standalone: false,
})
export class IoValueComponent {
  @Input()
  io: NodeIO;

  @Input()
  value: Primitive;

  @HostBinding("attr.data-type")
  get type() {
    return this.io?.type;
  }

  // image[] values travel as a "|"-joined string
  get joinedImages(): string {
    return this.value as string;
  }
}
