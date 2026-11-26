import { Component, ChangeDetectionStrategy } from "@angular/core";
import { TuiDialogContext } from "@taiga-ui/core";
import { injectContext } from "@taiga-ui/polymorpheus";

export type InspectSource = {
  type: "image" | "video" | "text" | "markdown" | "json";
  url?: string;
  text?: string;
};

/** A source shown full size in a Taiga dialog by the inspect directive. */
@Component({
  selector: "app-inspect",
  templateUrl: "./inspect.component.html",
  styleUrls: ["./inspect.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class InspectComponent {
  private readonly source =
    injectContext<TuiDialogContext<void, InspectSource>>().data;

  readonly type = this.source.type;
  readonly url = this.source.url;
  readonly text = this.source.text;
}
