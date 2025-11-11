import {
  Component,
  ElementRef,
  Renderer2,
  ViewEncapsulation,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { UI } from "src/consts/ui";
import { NodeToLaunch } from "src/models/launch-request";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { ProjectManager } from "src/services/project.manager";
import { NodeInputs } from "src/types/node";
import { Primitive } from "src/types/primitive";
import { toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-node-app",
  templateUrl: "./node-app.component.html",
  styleUrls: ["./node-app.component.scss"],
  encapsulation: ViewEncapsulation.None,
})
export class NodeAppComponent {
  userRole = UserRole;
  ui = UI;

  project!: Project;
  id!: string;
  node!: Node;

  constructor(
    private projectManager: ProjectManager,
    private route: ActivatedRoute,
    private host: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
  }

  async build() {
    const { pipeline, launchRequest } = this.project;

    this.renderer.setProperty(window, "Piper", {
      create: () => {
        return {
          meta: {
            node: toPlain(this.node),
          },
          inputs: (() => {
            const inputs: NodeInputs = {};
            for (const [key, input] of this.node.inputs) {
              inputs[key] =
                launchRequest.nodes.get(this.id)?.inputs?.get(key) ||
                input.default;
            }
            return inputs;
          })(),
          save: (inputs: NodeInputs) => {
            let nodeToLaunch = launchRequest.nodes.get(this.id);
            if (!nodeToLaunch) {
              nodeToLaunch = new NodeToLaunch();
              launchRequest.nodes.set(this.id, nodeToLaunch);
            }
            nodeToLaunch.inputs ??= new Map<string, Primitive>();

            const { inputs: update } = toInstance({ inputs }, NodeToLaunch);
            for (const [id, input] of this.node.inputs) {
              const value = update.get(id);
              if (value !== undefined && value !== input.default) {
                nodeToLaunch.inputs.set(id, value);
              }
            }

            this.projectManager.markDirty();
          },
        };
      },
    });

    const app = this.renderer.createElement("div");
    this.renderer.setProperty(app, "innerHTML", this.node.app);
    this.renderer.appendChild(this.host.nativeElement, app);

    const scripts: HTMLScriptElement[] = Array.from(
      this.host.nativeElement.querySelectorAll("script")
    );

    for (const script of scripts) {
      const s = document.createElement("script");
      for (const { name, value } of Array.from(script.attributes)) {
        s.setAttribute(name, value);
      }

      if (s.hasAttribute("src")) {
        s.async = false;
      }
      if (!s.src) {
        s.text = script.textContent ?? "";
      }

      const loadPromise = s.src
        ? new Promise<void>((resolve, reject) => {
            s.onload = () => resolve();
            s.onerror = () => reject(new Error(`Failed to load ${s.src}`));
          })
        : Promise.resolve();

      script.replaceWith(s);
      await loadPromise;
    }
  }
}
