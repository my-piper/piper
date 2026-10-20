import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { Component } from "@angular/core";
import {
  ComponentFixture,
  discardPeriodicTasks,
  flush,
  TestBed,
  tick,
} from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter, Router, Routes } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { AppModule } from "src/app/app.module";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { Project } from "src/models/project";
import { LaunchHeartbeatPipe } from "src/pipes/launch-heartbeat";
import { InputFlowsPipe, InputIndexOfPipe, NodePipe } from "src/pipes/node";
import { PipelineCostsPipe } from "src/pipes/pipeline-costs";
import { PipelineEnvironmentPipe } from "src/pipes/pipeline-environment";
import { PipelineNodeUpdatesPipe } from "src/pipes/pipeline-node-updates";
import { ProjectManager } from "src/services/project.manager";
import { TickerPipe } from "src/ui-kit/pipes/ticker.pipe";
import { projectA } from "../fixtures/models";
import { userPlain, UserKind } from "../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "./config";
import { asJitPipes } from "./jit";
import { provideSocketDouble, SocketDouble } from "./socket";

/** Placeholder for routed drawers; the editor's own template stays real. */
@Component({ standalone: true, template: "<p>outlet</p>" })
export class OutletStubComponent {}

export const EDITOR_URL = "/project";

/**
 * TestBed with the real AppModule declarations (all app/ui-kit components,
 * pipes and directives) and test boundaries: HttpTestingController,
 * SocketDouble, test runtime config and the given routes.
 */
export function configureAppTestingModule(routes: Routes = []) {
  // Every AppModule pipe that extends the UntilDestroyed directive base.
  asJitPipes(
    TickerPipe,
    NodePipe,
    InputIndexOfPipe,
    InputFlowsPipe,
    PipelineCostsPipe,
    LaunchHeartbeatPipe,
    PipelineEnvironmentPipe,
    PipelineNodeUpdatesPipe,
  );

  TestBed.configureTestingModule({
    imports: [AppModule],
    providers: [
      provideTestConfig(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideSocketDouble(),
      provideRouter(routes),
    ],
  });
}

/**
 * Renders the real EditPipelineVisualComponent (full AppModule declarations,
 * real ProjectManager/HttpService/MeManager/LiveService) inside a real router,
 * with HTTP on HttpTestingController and sockets on SocketDouble.
 * Call inside `fakeAsync`.
 */
export function setupEditor({
  project = projectA(),
  user = "owner",
  mode,
}: {
  project?: Project;
  user?: UserKind;
  mode?: "project" | "scheme";
} = {}) {
  seedAuthorization(userPlain(user));
  configureAppTestingModule([
    {
      path: EDITOR_URL.slice(1),
      component: EditPipelineVisualComponent,
      data: mode ? { mode } : {},
      resolve: { project: () => project },
      children: [
        {
          path: "add-node",
          outlet: "left",
          component: OutletStubComponent,
        },
        {
          path: "nodes/:id",
          outlet: "right",
          component: OutletStubComponent,
        },
        { path: "inputs/:id", component: OutletStubComponent },
      ],
    },
  ]);

  const controller = TestBed.inject(HttpTestingController);
  const manager = TestBed.inject(ProjectManager);
  manager.project = project;
  const socket = TestBed.inject(SocketDouble);
  const router = TestBed.inject(Router);

  // The real root hosts <app-popover>/<app-modal>, which popovers need.
  const fixture: ComponentFixture<AppComponent> =
    TestBed.createComponent(AppComponent);
  router.navigateByUrl(EDITOR_URL);
  tick();
  fixture.detectChanges();
  controller.expectOne("/api/me").flush(userPlain(user));
  fixture.detectChanges();

  const debug = fixture.debugElement.query(
    By.directive(EditPipelineVisualComponent),
  );
  const editor = debug.componentInstance as EditPipelineVisualComponent;
  const element = debug.nativeElement as HTMLElement;
  const detectChanges = () => fixture.detectChanges();

  return {
    fixture,
    detectChanges,
    editor,
    element,
    controller,
    manager,
    socket,
    router,
    project,
  };
}

export function nodeElement(element: HTMLElement, id: string): HTMLElement {
  const node = Array.from(element.querySelectorAll("app-node")).find(
    (e) => e.getAttribute("ng-reflect-id") === id,
  ) as HTMLElement;
  if (!node) {
    throw new Error(`Node ${id} is not rendered`);
  }
  return node;
}

/** Port button of a node's output (by visible title). */
export function outputPin(node: HTMLElement, title: string): HTMLElement {
  return portPin(node, "ul.outputs > li", title);
}

/** Port button of a node's featured input (by visible title). */
export function inputPin(node: HTMLElement, title: string): HTMLElement {
  return portPin(node, "ul.inputs li", title);
}

function portPin(node: HTMLElement, selector: string, title: string) {
  const port = Array.from(node.querySelectorAll(selector)).find(
    (li) => li.querySelector(".title")?.textContent.trim() === title,
  );
  if (!port) {
    throw new Error(`Port ${title} is not rendered`);
  }
  return port.querySelector("button.circle") as HTMLElement;
}

export function mouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  { x = 0, y = 0 } = {},
) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }),
  );
}

/** Ends a fakeAsync spec: drops UI-kit intervals, runs remaining timers. */
export function finish() {
  discardPeriodicTasks();
  flush();
}
