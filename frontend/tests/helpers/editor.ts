import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  ChangeDetectionStrategy,
  Component,
  createComponent,
  EnvironmentInjector,
  inject,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { TopbarService } from "src/services/topbar.service";
import {
  ComponentFixture,
  discardPeriodicTasks,
  flush,
  TestBed,
  tick,
} from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter, Router, Routes } from "@angular/router";
import { EditorComponent, MonacoEditorModule } from "ngx-monaco-editor-v2";
import { AppComponent } from "src/app/app.component";
import { AppModule } from "src/app/app.module";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { NodeComponent } from "src/app/node/node.component";
import { Launch } from "src/models/launch";
import { Project } from "src/models/project";
import { componentOf } from "./component";
import { ProjectManager } from "src/services/project.manager";
import { projectA } from "../fixtures/models";
import { userPlain, UserKind } from "../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "./config";
import { MonacoEditorStubComponent } from "./editor-stubs";
import { provideSocketDouble, SocketDouble } from "./socket";
import { expectNativeSelectReadOnly } from "./taiga";

/** Placeholder for routed drawers; the editor's own template stays real. */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: "<p>outlet</p>",
})
export class OutletStubComponent {}

export const EDITOR_URL = "/project";

/**
 * TestBed with the real AppModule declarations (all app components,
 * pipes and directives) and test boundaries: HttpTestingController,
 * SocketDouble, test runtime config and the given routes. `<ngx-monaco-editor>`
 * renders MonacoEditorStubComponent: real Monaco starts web workers that fail
 * in the test runner after the spec ends. Pass `nativeSelect` when the spec
 * renders a Taiga native select, whose `readOnly` binding TestBed only logs then.
 */
export function configureAppTestingModule(
  routes: Routes = [],
  { nativeSelect = false }: { nativeSelect?: boolean } = {},
) {
  if (nativeSelect) {
    expectNativeSelectReadOnly();
  }
  TestBed.overrideModule(MonacoEditorModule, {
    remove: { imports: [EditorComponent], exports: [EditorComponent] },
    add: {
      imports: [MonacoEditorStubComponent],
      exports: [MonacoEditorStubComponent],
    },
  });
  TestBed.configureTestingModule({
    errorOnUnknownProperties: !nativeSelect,
    imports: [AppModule],
    providers: [
      provideTestConfig(),
      provideHttpClient(withXhr()),
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
  launch,
  editable = !launch,
  runs = true,
}: {
  project?: Project;
  user?: UserKind;
  /** Route data flags; the defaults are the project page's. */
  editable?: boolean;
  runs?: boolean;
  /** Renders the read-only page of this Launch. */
  launch?: Launch;
} = {}) {
  seedAuthorization(userPlain(user));
  configureAppTestingModule([
    {
      path: EDITOR_URL.slice(1),
      component: EditPipelineVisualComponent,
      data: { editable, runs },
      resolve: launch ? { launch: () => launch } : { project: () => project },
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
        {
          path: "nodes/:id/logs",
          outlet: "right",
          component: OutletStubComponent,
        },
        { path: "inputs/:id", component: OutletStubComponent },
        { path: "nodes/:id/edit/script", component: OutletStubComponent },
      ],
    },
  ]);

  const controller = TestBed.inject(HttpTestingController);
  const manager = TestBed.inject(ProjectManager);
  manager.project = project;
  const socket = TestBed.inject(SocketDouble);
  const router = TestBed.inject(Router);

  // The real root hosts tui-root, which Taiga overlays render into.
  const fixture: ComponentFixture<AppComponent> =
    TestBed.createComponent(AppComponent);
  router.navigateByUrl(EDITOR_URL);
  tick();
  fixture.detectChanges();
  // Only an editable canvas asks who the user is (the engineer role decides
  // which nodes offer Edit); a read-only one never does.
  controller.match("/api/me").forEach((me) => me.flush(userPlain(user)));
  fixture.detectChanges();

  const debug = fixture.debugElement.query(
    By.directive(EditPipelineVisualComponent),
  );
  const editor = debug.componentInstance as EditPipelineVisualComponent;
  const element = debug.nativeElement as HTMLElement;
  // A second TestBed fixture would detach the app root (TestBed keeps one
  // root element in the DOM), so the outlet is created and attached by hand.
  const bar = createComponent(TopbarOutletStubComponent, {
    environmentInjector: TestBed.inject(EnvironmentInjector),
  });
  document.body.appendChild(bar.location.nativeElement);
  bar.changeDetectorRef.detectChanges();
  /** The app top bar's page slots: the Launch action and the run state. */
  const topbar = bar.location.nativeElement as HTMLElement;
  fixture.componentRef.onDestroy(() => {
    bar.destroy();
    topbar.remove();
  });
  const detectChanges = () => {
    fixture.detectChanges();
    bar.changeDetectorRef.detectChanges();
  };

  return {
    fixture,
    detectChanges,
    editor,
    element,
    topbar,
    controller,
    manager,
    socket,
    router,
    project,
  };
}

/** Shows the top bar slots pages fill, like AppLayoutComponent does. */
@Component({
  selector: "app-topbar-outlet-stub",
  template: `<ng-container [ngTemplateOutlet]="topbar.content()" />
    <ng-container [ngTemplateOutlet]="topbar.actions()" />`,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
})
class TopbarOutletStubComponent {
  readonly topbar = inject(TopbarService);
}

export function nodeElement(element: HTMLElement, id: string): HTMLElement {
  const node = Array.from(element.querySelectorAll("app-node")).find(
    (e) => componentOf<NodeComponent>(e)?.id === id,
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
  // Scalar inputs are widget rows (#305); their socket is wireable too.
  return portPin(node, "ul.inputs li, ul.widgets li", title);
}

function portPin(node: HTMLElement, selector: string, title: string) {
  const port = Array.from(node.querySelectorAll(selector)).find(
    (li) => li.querySelector(".title, .name")?.textContent.trim() === title,
  );
  if (!port) {
    throw new Error(`Port ${title} is not rendered`);
  }
  return port.querySelector("button.port") as HTMLElement;
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
