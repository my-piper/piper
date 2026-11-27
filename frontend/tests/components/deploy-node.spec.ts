import { fakeAsync, tick } from "@angular/core/testing";
import { projectWith } from "../fixtures/models";
import { Plain, smallGraphPipeline } from "../fixtures/plain";
import { finish, setupEditor } from "../helpers/editor";

/**
 * Wire contract (backend/api/deploys/get-deploy-sockets.ts):
 * GET /api/deploys/:prefix/:slug/sockets → the Deploy with its pipeline
 * inputs and outputs in the Node input and output shape.
 */
const SOCKETS_URL = "/api/deploys/owner/summarizer/sockets";
const UI_DELAY = 250;

/** The node's box on the canvas, with its title-bar actions. */
function nodeBox(element: HTMLElement, id: string) {
  return element.querySelector(`.node[data-node="${id}"]`) as HTMLElement;
}

function socketsPlain(): Plain {
  return {
    prefix: "owner",
    slug: "summarizer",
    title: "Summarizer",
    deployedAt: "2026-01-01T00:00:00.000Z",
    inputs: {
      text: { title: "Text", type: "string" },
      topic: { title: "Topic", type: "string", required: true },
    },
    outputs: { summary: { title: "Summary", type: "string" } },
  };
}

/** smallGraph with node_two running the summarizer Deploy. */
function deployProject() {
  const pipeline = smallGraphPipeline() as { nodes: Record<string, Plain> };
  const { script: _script, ...node } = pipeline.nodes["node_two"];
  pipeline.nodes["node_two"] = {
    ...node,
    execution: undefined,
    source: "deploy",
    deploy: { prefix: "owner", slug: "summarizer" },
  };
  return projectWith(pipeline);
}

describe("deploy nodes on the canvas", () => {
  it("adds a dropped Deploy as a node with its sockets as ports", fakeAsync(() => {
    const project = projectWith(smallGraphPipeline());
    const { editor, controller, element, detectChanges } = setupEditor({
      project,
    });

    editor.addNode(120, 80, {
      deploy: { prefix: "owner", slug: "summarizer" },
    });
    controller.expectOne(SOCKETS_URL).flush(socketsPlain());
    tick(UI_DELAY);
    detectChanges();

    const [id] = [...project.pipeline.nodes.keys()].filter((k) =>
      k.startsWith("deploy_summarizer_"),
    );
    const node = project.pipeline.nodes.get(id);
    expect(node).toMatchObject({
      title: "Summarizer",
      source: "deploy",
      deploy: { prefix: "owner", slug: "summarizer" },
      arrange: { x: 120, y: 80 },
    });
    expect([...node.inputs.values()].map((i) => i.featured)).toEqual([
      true,
      true,
    ]);
    expect([...node.outputs.keys()]).toEqual(["summary"]);
    const added = nodeBox(element, id);
    expect(
      added.querySelector('[data-testid="deploy-refresh"]'),
    ).not.toBeNull();
    expect(added.querySelector(".edit")).toBeNull();
    expect(added.querySelector('[data-testid="deploy-mismatch"]')).toBeNull();
    finish();
  }));

  it("names its Deploy in the node title's hover text", fakeAsync(() => {
    const { controller, element, detectChanges } = setupEditor({
      project: deployProject(),
    });

    controller.expectOne(SOCKETS_URL).flush(socketsPlain());
    detectChanges();

    const title = nodeBox(element, "node_two").querySelector(
      '[data-testid="node-title"]',
    );
    expect(title.getAttribute("title")).toMatch(/ · owner\/summarizer$/);
    finish();
  }));

  it("warns about a deploy node that no longer matches its Deploy", fakeAsync(() => {
    const { controller, element, detectChanges } = setupEditor({
      project: deployProject(),
    });

    controller.expectOne(SOCKETS_URL).flush(socketsPlain());
    detectChanges();

    const warning = nodeBox(element, "node_two").querySelector(
      '[data-testid="deploy-mismatch"]',
    );
    expect(warning.getAttribute("title")).toBe(
      "input flag is gone; input count is gone; input label is gone; " +
        "required input topic is missing; output result is gone; " +
        "output images is gone",
    );
    finish();
  }));

  it("refreshes the sockets from the Deploy and drops the wires of removed ones", fakeAsync(() => {
    const project = deployProject();
    const { editor, controller, element, manager, detectChanges } = setupEditor(
      { project },
    );
    controller.expectOne(SOCKETS_URL).flush(socketsPlain());
    detectChanges();

    editor.refreshDeployNode("node_two");
    controller.expectOne(SOCKETS_URL).flush(socketsPlain());
    detectChanges();

    const node = project.pipeline.nodes.get("node_two");
    expect([...node.inputs.keys()]).toEqual(["text", "topic"]);
    expect([...node.outputs.keys()]).toEqual(["summary"]);
    expect([...project.pipeline.flows.keys()]).toEqual(["one_to_two"]);
    expect(project.pipeline.outputs.get("result").flows.size).toBe(0);
    expect(
      nodeBox(element, "node_two").querySelector(
        '[data-testid="deploy-mismatch"]',
      ),
    ).toBeNull();
    expect(manager.status.value).toBe("dirty");
    finish();
  }));
});
