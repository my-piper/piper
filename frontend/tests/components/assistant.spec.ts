import { HttpTestingController } from "@angular/common/http/testing";
import { createComponent, EnvironmentInjector, Injector } from "@angular/core";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { AssistantComponent } from "src/app/assistant/assistant.component";
import { Project } from "src/models/project";
import { projectA, projectWith } from "../fixtures/models";
import { PROJECT_A_ID, smallGraphPipeline, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import {
  configureAppTestingModule,
  finish,
  setupEditor,
} from "../helpers/editor";

const CHAT_URL = `/api/projects/${PROJECT_A_ID}/assistant/chat`;
const ASSIST_URL = `/api/projects/${PROJECT_A_ID}/assist`;
// The component puts the question into the chat after this pause.
const ECHO_DELAY = 100;

function routeOf(project: Project) {
  const route = {
    data: of({ project }),
    snapshot: { data: {} },
    children: [] as unknown[],
  };
  return { ...route, root: route };
}

function setup(project = projectA()) {
  seedAuthorization(userPlain("owner"));
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, { useValue: routeOf(project) });
  const fixture = TestBed.createComponent(AssistantComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  controller.expectOne(CHAT_URL).flush([]);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;

  return {
    fixture,
    controller,
    element,
    question: () => element.querySelector("textarea"),
    senders: () =>
      Array.from(element.querySelectorAll(".message")).map((m) =>
        m.getAttribute("data-from"),
      ),
  };
}

function type(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
  textarea.dispatchEvent(new Event("input"));
}

/** Asks the assistant a question and answers it with these changes. */
function answer(
  page: { element: HTMLElement; controller: HttpTestingController },
  changes: object[],
) {
  const question = page.element.querySelector("textarea");
  type(question, "Change the pipeline");
  question.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  page.controller
    .expectOne((r) => r.method === "POST" && r.url === ASSIST_URL)
    .flush({ from: "assistant", message: "Done", changes });
  tick(ECHO_DELAY);
}

/**
 * The assistant next to the real canvas over one project, as in the
 * editor's bottom drawer. A second TestBed fixture would detach the app
 * root, so the assistant is created and attached by hand.
 */
function setupWithCanvas(project: Project) {
  const editor = setupEditor({ project });
  const assistant = createComponent(AssistantComponent, {
    environmentInjector: TestBed.inject(EnvironmentInjector),
    elementInjector: Injector.create({
      providers: [{ provide: ActivatedRoute, useValue: routeOf(project) }],
    }),
  });
  const element = assistant.location.nativeElement as HTMLElement;
  document.body.appendChild(element);
  assistant.changeDetectorRef.detectChanges();
  editor.controller.expectOne(CHAT_URL).flush([]);
  editor.fixture.componentRef.onDestroy(() => {
    assistant.destroy();
    element.remove();
  });
  return { ...editor, assistant: { element, controller: editor.controller } };
}

describe("AssistantComponent", () => {
  it("sends the question on Enter and shows both sides of the chat", fakeAsync(() => {
    const page = setup();
    type(page.question(), "Add a node");

    page
      .question()
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    const request = page.controller.expectOne(
      (r) => r.method === "POST" && r.url === ASSIST_URL,
    );
    const body = request.request.body;
    tick(ECHO_DELAY);
    page.fixture.detectChanges();
    const cleared = page.question().value;
    const waiting = page.fixture.nativeElement.querySelector("tui-loader");
    request.flush({ from: "assistant", message: "Done" });
    page.fixture.detectChanges();

    expect(body).toEqual({ question: "Add a node" });
    expect(cleared).toBe("");
    expect(waiting).not.toBeNull();
    expect(page.question().disabled).toBe(false);
    expect(page.senders()).toEqual(["user", "assistant"]);
    page.controller.verify();
    finish();
  }));

  it("removes a wired Node with its Flows while the canvas renders", fakeAsync(() => {
    const project = projectA();
    const page = setupWithCanvas(project);
    const { pipeline } = project;

    answer(page.assistant, [
      { action: "remove_node", data: { id: "node_one" } },
    ]);
    page.detectChanges();

    const rendered = Array.from(
      page.element.querySelectorAll("app-node h2"),
    ).map((h) => h.textContent.trim());
    const ends = [
      ...[...pipeline.flows.values()].flatMap((f) => [f.from, f.to]),
      ...[...pipeline.inputs.values()].flatMap((i) =>
        [...(i.flows?.values() ?? [])].map((f) => f.to),
      ),
      ...[...pipeline.outputs.values()].flatMap((o) =>
        [...(o.flows?.values() ?? [])].map((f) => f.from),
      ),
    ];
    expect(pipeline.nodes.has("node_one")).toBe(false);
    expect(ends).not.toContain("node_one");
    expect(pipeline.flows.size).toBe(0);
    expect(pipeline.inputs.get("topic").flows.size).toBe(0);
    expect(pipeline.outputs.get("result").flows.size).toBe(1);
    expect(pipeline.start.nodes).toEqual([]);
    expect(rendered).toEqual(["Make JSON"]);
    expect(page.manager.status.value).toBe("dirty");
    finish();
  }));

  it("adds a Flow only between fitting ports, typed like the canvas", fakeAsync(() => {
    const project = projectA();
    const page = setup(project);
    const { pipeline } = project;

    answer(page, [
      {
        action: "add_flow",
        data: {
          id: "two_to_one",
          json: {
            from: "node_two",
            output: "result",
            to: "node_one",
            input: "prompt",
            transformer: { type: "json", path: "data.text" },
          },
        },
      },
      {
        action: "add_flow",
        data: {
          id: "images_to_prompt",
          json: {
            from: "node_two",
            output: "images",
            to: "node_one",
            input: "prompt",
          },
        },
      },
    ]);

    const added = [...pipeline.flows.values()].filter(
      (f) => f.from === "node_two",
    );
    expect(added.map((f) => f.output)).toEqual(["result"]);
    expect(added[0].transformer).toEqual(
      expect.objectContaining({ type: "json", path: "data.text" }),
    );
    finish();
  }));

  it("makes the first Node it adds the Start Node", fakeAsync(() => {
    const empty = smallGraphPipeline() as Record<string, unknown>;
    Object.assign(empty, {
      nodes: {},
      flows: {},
      inputs: {},
      outputs: {},
      start: { nodes: [] },
    });
    const project = projectWith(empty);
    const page = setup(project);
    const json = (smallGraphPipeline() as { nodes: Record<string, object> })
      .nodes["node_one"];

    answer(page, [
      { action: "add_node", data: { id: "first", json } },
      { action: "add_node", data: { id: "second", json } },
    ]);

    expect([...project.pipeline.nodes.keys()]).toEqual(["first", "second"]);
    expect(project.pipeline.start.nodes).toEqual(["first"]);
    finish();
  }));
});
