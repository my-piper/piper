import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  input,
  resource,
  signal,
} from "@angular/core";
import { TuiButtonCopy, TuiTabs } from "@taiga-ui/kit";
import { SCRIPT_EXAMPLES } from "./script-examples";

type MonacoWindow = Window & {
  monaco?: {
    editor: {
      colorize(
        code: string,
        language: string,
        options: object,
      ): Promise<string>;
    };
  };
};

@Component({
  selector: "app-node-script-help",
  templateUrl: "./node-script-help.component.html",
  styleUrls: ["./node-script-help.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TuiTabs, TuiButtonCopy],
})
export class NodeScriptHelpComponent {
  // the script editor loads Monaco as a global
  private readonly window = inject(DOCUMENT).defaultView as MonacoWindow;

  readonly scriptNode = input(false);

  readonly examples = SCRIPT_EXAMPLES;
  readonly active = signal(0);
  readonly example = computed(() => {
    const example = this.examples[this.active()];
    return this.scriptNode() && example.scriptNode
      ? { ...example, ...example.scriptNode }
      : example;
  });

  // the code coloured as the editor colours it; plain text until it is ready
  // or while Monaco has not loaded, which is checked again on every example
  readonly highlighted = resource({
    params: () => {
      const { code } = this.example();
      return this.window?.monaco ? code : undefined;
    },
    loader: ({ params: code }) =>
      this.window.monaco.editor.colorize(code, "javascript", { tabSize: 2 }),
  });
}
