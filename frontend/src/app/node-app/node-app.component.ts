import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Renderer2,
  ViewEncapsulation,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom, map } from "rxjs";
import { UI } from "src/consts/ui";
import { NodeToLaunch } from "src/models/launch-request";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
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
    private http: HttpService,
    private projectManager: ProjectManager,
    private router: Router,
    private route: ActivatedRoute,
    private host: ElementRef,
    private renderer: Renderer2,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
  }

  async getApp(): Promise<string> {
    if (/^http/.test(this.node.app)) {
      return await firstValueFrom(
        this.http
          .get("utils/fetch", { url: this.node.app }, { responseType: "text" })
          .pipe(map((resp) => resp as string))
      );
    }
    return this.node.app;
  }

  async build() {
    const { launchRequest } = this.project;

    const app = this.renderer.createElement("div");
    const appRoot = app.attachShadow({ mode: "open" });
    this.renderer.setProperty(appRoot, "innerHTML", await this.getApp());
    this.renderer.appendChild(this.host.nativeElement, app);

    const links = appRoot.querySelectorAll('link[rel="stylesheet"]');
    links.forEach((old: HTMLLinkElement) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = old.href;
      appRoot.appendChild(l);
      old.remove();
    });

    const styles = appRoot.querySelectorAll("style");
    styles.forEach((old: HTMLStyleElement) => {
      const s = document.createElement("style");
      s.textContent = old.textContent;
      appRoot.appendChild(s);
      old.remove();
    });

    this.renderer.setProperty(window, "Piper", {
      create: () => {
        return {
          appRoot,
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
            this.cd.detectChanges();
          },
          close: () => {
            this.router.navigate(["../.."], {
              relativeTo: this.route,
            });
          },
        };
      },
    });

    const scripts: HTMLScriptElement[] = Array.from(
      appRoot.querySelectorAll("script")
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
