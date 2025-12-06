import { Component, HostBinding, Input } from "@angular/core";
import { NodeInput, NodeOutput } from "src/models/node";
import { Primitive } from "src/types/primitive";

@Component({
  selector: "app-io-value",
  templateUrl: "./io-value.component.html",
  styleUrls: ["./io-value.component.scss"],
})
export class IoValueComponent {
  @Input()
  io: NodeInput | NodeOutput;

  @Input()
  value: Primitive;

  @HostBinding("attr.data-type")
  get type() {
    return this.io?.type;
  }
}
