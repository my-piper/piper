import { Observable, Subject } from "rxjs";
import { Arrange } from "src/models/arrange";
import { InputFlow } from "src/models/input-flow";
import { LaunchRequest, NodeToLaunch } from "src/models/launch-request";
import { Node, NodeInput, NodeOutput } from "src/models/node";
import { FlowTransformer, NodeFlow } from "src/models/node-flow";
import { Pipeline } from "src/models/pipeline";
import { Point } from "src/types/point";
import { CanvasClip } from "src/utils/canvas-clipboard";
import { toInstance } from "src/utils/models";
import { sid } from "src/utils/string";

/** Where a Flow starts: a Node output or a pipeline input. */
export type FlowSource = { node: string; output: string } | { input: string };

/** Where a Flow ends: a Node input. */
export type FlowTarget = { node: string; input: string };

/**
 * Edits the structure of a Pipeline: its Nodes and the Flows between them.
 * Every edit keeps the Pipeline consistent (a Flow lives only while both its
 * ends exist, the first Node becomes the Start Node, ids and keys are unique)
 * and ends with one `changed` emission, which the owner turns into a save.
 *
 * Layout (positions, groups, zoom) and launch values stay with the screens:
 * they have no rules to keep.
 */
export class PipelineEditor {
  private readonly changes = new Subject<void>();

  /** Emits once after every edit that changed the Pipeline. */
  readonly changed: Observable<void> = this.changes.asObservable();

  constructor(
    private readonly pipeline: Pipeline,
    private readonly launchRequest: LaunchRequest | null = null,
  ) {}

  /**
   * Adds a Node under `id`, or under a new id made from its `_id`, placed at
   * `at` when given. The first Node of a Pipeline becomes its Start Node.
   * Returns the Node's id.
   */
  addNode(node: Node, { at, id }: { at?: Point; id?: string } = {}): string {
    const key = id ?? nodeId(node);
    if (at) {
      node.arrange = Object.assign(node.arrange ?? new Arrange(), {
        x: at.x,
        y: at.y,
      });
    }
    this.pipeline.nodes.set(key, node);
    this.markStart(key);
    this.changes.next();
    return key;
  }

  /**
   * Puts `node` in place of the Node `id`, where that Node stood, and drops
   * the Flows and launch values of the sockets `node` no longer has. The
   * Node may be the same object, changed in place. False for an unknown id.
   */
  replaceNode(id: string, node: Node): boolean {
    const current = this.pipeline.nodes.get(id);
    if (!current) {
      return false;
    }
    if (current !== node && current.arrange) {
      node.arrange = Object.assign(node.arrange ?? new Arrange(), {
        x: current.arrange.x,
        y: current.arrange.y,
      });
    }
    this.pipeline.nodes.set(id, node);
    dropDangling(this.pipeline, this.launchRequest);
    this.changes.next();
    return true;
  }

  /**
   * Removes a Node with every Flow into or out of it, its Start Node mark
   * and its launch values. Flows can't wait for `ProjectManager`'s sanitation:
   * the canvas resolves Flow ends through the `node` pipe, which throws for
   * unknown Nodes.
   */
  removeNode(id: string) {
    this.pipeline.nodes.delete(id);
    dropDangling(this.pipeline, this.launchRequest);
    this.changes.next();
  }

  /**
   * Input types a Flow from `source` can end at, or null for an unknown
   * source. A JSON output feeds scalars through a transformer, a single image
   * and an image list feed each other; a pipeline input matches exactly.
   */
  accepts(source: FlowSource): string[] | null {
    const type =
      "output" in source
        ? this.pipeline.nodes.get(source.node)?.outputs.get(source.output)?.type
        : this.pipeline.inputs?.get(source.input)?.type;
    if (!type) {
      return null;
    }
    return "output" in source ? acceptedInputTypes(type) : [type];
  }

  /**
   * Connects `source` to `target` when their types fit, with the transformer
   * the types call for. A given `transformer` of that kind keeps its settings
   * (a JSON path, an array index). Returns the new Flow's key, or null when
   * an end is unknown or the types don't fit.
   */
  connect(
    source: FlowSource,
    target: FlowTarget,
    transformer?: FlowTransformer,
  ): string | null {
    const input = this.pipeline.nodes
      .get(target.node)
      ?.inputs.get(target.input);
    if (!input) {
      return null;
    }

    if (!("output" in source)) {
      const from = this.pipeline.inputs?.get(source.input);
      if (!from || from.type !== input.type) {
        return null;
      }
      const key = `to_${target.node}_${target.input}_${sid(5)}`;
      from.flows ??= new Map();
      from.flows.set(
        key,
        new InputFlow({ to: target.node, input: target.input }),
      );
      this.changes.next();
      return key;
    }

    const output = this.pipeline.nodes
      .get(source.node)
      ?.outputs.get(source.output);
    const typed = output ? flowTransformer(output, input) : false;
    if (typed === false) {
      return null;
    }

    const flow = toInstance(
      {
        from: source.node,
        output: source.output,
        to: target.node,
        input: target.input,
      },
      NodeFlow,
    );
    if (typed) {
      flow.transformer =
        transformer?.type === typed.type
          ? toInstance({ ...typed, ...transformer }, FlowTransformer)
          : typed;
    }
    const key = flowKey(flow);
    this.pipeline.flows ??= new Map();
    this.pipeline.flows.set(key, flow);
    this.changes.next();
    return key;
  }

  /**
   * Adds a copy of `clip` with new Node ids and Flow keys, its top-left Node
   * corner at `at`, or 40px off the originals without a point. The copies
   * keep their input values; the first becomes the Start Node of an empty
   * Pipeline. Returns the new ids.
   */
  paste(clip: CanvasClip, at: Point | null = null): string[] {
    const nodes = clip.nodes.map(
      ([id, plain]) => [id, toInstance(plain, Node)] as const,
    );
    if (nodes.length <= 0) {
      return [];
    }
    const left = Math.min(...nodes.map(([, n]) => n.arrange?.x ?? 0));
    const top = Math.min(...nodes.map(([, n]) => n.arrange?.y ?? 0));
    const corner = at ?? { x: left + 40, y: top + 40 };

    const ids = new Map<string, string>();
    for (const [id, node] of nodes) {
      const copy = nodeId(node);
      ids.set(id, copy);
      node.arrange = Object.assign(node.arrange ?? new Arrange(), {
        x: corner.x + (node.arrange?.x ?? 0) - left,
        y: corner.y + (node.arrange?.y ?? 0) - top,
      });
      this.pipeline.nodes.set(copy, node);
    }

    this.pipeline.flows ??= new Map();
    for (const plain of clip.flows) {
      const flow = toInstance(plain, NodeFlow);
      flow.from = ids.get(flow.from);
      flow.to = ids.get(flow.to);
      if (flow.from && flow.to) {
        this.pipeline.flows.set(flowKey(flow), flow);
      }
    }

    if (this.launchRequest) {
      this.launchRequest.nodes ??= new Map();
      for (const [id, plain] of clip.inputs) {
        const copy = ids.get(id);
        if (copy) {
          const { inputs } = toInstance(plain, NodeToLaunch);
          this.launchRequest.nodes.set(copy, new NodeToLaunch({ inputs }));
        }
      }
    }

    const pasted = [...ids.values()];
    this.markStart(pasted[0]);
    this.changes.next();
    return pasted;
  }

  /** The first Node of a Pipeline becomes its Start Node. */
  private markStart(id: string) {
    const { start } = this.pipeline;
    if (start.nodes.length <= 0) {
      start.nodes.push(id);
    }
  }
}

/**
 * Drops everything that points at a missing Node or socket: Flows whose end
 * is gone (or ends at an input that is not featured), Start Node marks and
 * launch values. `ProjectManager` runs it before its other sanitation.
 */
export function dropDangling(
  pipeline: Pipeline,
  launchRequest: LaunchRequest | null,
) {
  const { nodes, flows, inputs, outputs, start } = pipeline;
  const target = (to: string, input: string) =>
    !!nodes.get(to)?.inputs.get(input)?.featured;
  const source = (from: string, output: string) =>
    !!nodes.get(from)?.outputs.has(output);

  for (const [id, flow] of flows ?? []) {
    if (!source(flow.from, flow.output) || !target(flow.to, flow.input)) {
      flows.delete(id);
    }
  }
  for (const [, input] of inputs ?? []) {
    for (const [id, flow] of input.flows ?? []) {
      if (!target(flow.to, flow.input)) {
        input.flows.delete(id);
      }
    }
  }
  for (const [, output] of outputs ?? []) {
    for (const [id, flow] of output.flows ?? []) {
      if (!source(flow.from, flow.output)) {
        output.flows.delete(id);
      }
    }
  }
  start.nodes = start.nodes.filter((id) => nodes.has(id));

  for (const [id, values] of launchRequest?.nodes ?? []) {
    const node = nodes.get(id);
    if (!node) {
      launchRequest.nodes.delete(id);
      continue;
    }
    for (const key of [...(values.inputs?.keys() ?? [])]) {
      if (!node.inputs.has(key)) {
        values.inputs.delete(key);
      }
    }
    for (const key of [...(values.outputs?.keys() ?? [])]) {
      if (!node.outputs.has(key)) {
        values.outputs.delete(key);
      }
    }
  }
}

function acceptedInputTypes(type: string): string[] {
  switch (type) {
    case "json":
      return ["json", "string", "integer", "float", "boolean"];
    case "image":
    case "image[]":
      return ["image", "image[]"];
    default:
      return [type];
  }
}

/**
 * The transformer a Flow from `output` to `input` needs, null for none, or
 * false when the types don't fit. JSON ports connect only with the same
 * schema.
 */
function flowTransformer(
  output: NodeOutput,
  input: NodeInput,
): FlowTransformer | null | false {
  if (!acceptedInputTypes(output.type).includes(input.type)) {
    return false;
  }
  switch (output.type) {
    case "json":
      if (input.type === "json") {
        return output.schema === input.schema?.id ? null : false;
      }
      return toInstance({ type: "json" }, FlowTransformer);
    case "image":
    case "image[]":
      return output.type !== input.type
        ? toInstance({ type: "array", index: 0 }, FlowTransformer)
        : null;
    default:
      return null;
  }
}

function nodeId(node: Node): string {
  return `${node._id || "imported"}_${sid()}`;
}

function flowKey({ from, to }: NodeFlow): string {
  return `${from}_to_${to}_${sid(5)}`;
}
