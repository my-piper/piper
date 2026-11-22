import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from "@angular/core";
import { TuiButtonCopy, TuiTabs } from "@taiga-ui/kit";
import { SCRIPT_EXAMPLES } from "./script-examples";

@Component({
  selector: "app-node-script-help",
  templateUrl: "./node-script-help.component.html",
  styleUrls: ["./node-script-help.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TuiTabs, TuiButtonCopy],
})
export class NodeScriptHelpComponent {
  readonly scriptNode = input(false);

  readonly examples = SCRIPT_EXAMPLES;
  readonly active = signal(0);
  readonly example = computed(() => {
    const example = this.examples[this.active()];
    return this.scriptNode() && example.scriptNode
      ? { ...example, ...example.scriptNode }
      : example;
  });
}
