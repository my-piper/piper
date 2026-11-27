import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  resource,
  signal,
} from "@angular/core";
import { TUI_BREAKPOINT, tuiButtonOptionsProvider } from "@taiga-ui/core";
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
  // Copy sits in the code's toolbar, which takes size s (docs/design.md)
  providers: [tuiButtonOptionsProvider({ size: "s" })],
  host: { "[class.narrow]": "narrow()" },
})
export class NodeScriptHelpComponent {
  // the script editor loads Monaco as a global
  private readonly window = inject(DOCUMENT).defaultView as MonacoWindow;

  private readonly breakpoint = inject(TUI_BREAKPOINT);

  /** Below Taiga's mobile breakpoint the tabs run across the top. */
  readonly narrow = computed(() => this.breakpoint() === "mobile");

  readonly examples = SCRIPT_EXAMPLES;
  readonly active = signal(0);
  readonly example = computed(() => this.examples[this.active()]);

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
