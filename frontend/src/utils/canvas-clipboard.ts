import { LaunchRequest, NodeToLaunch } from "src/models/launch-request";
import { Node } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { Pipeline } from "src/models/pipeline";
import { Point } from "src/types/point";
import { toInstance, toPlain } from "src/utils/models";

/**
 * Copied canvas nodes as plain data, detached from the pipeline they came
 * from: the nodes by id, the flows between them, and their input values.
 */
export type CanvasClip = {
  nodes: [string, object][];
  flows: object[];
  inputs: [string, object][];
};

const MARK = "piper/canvas-clip";

/** The clip as clipboard text: marked JSON, so a paste can tell it apart. */
export function clipToText(clip: CanvasClip): string {
  return JSON.stringify({ [MARK]: 1, ...clip });
}

/** The clip in clipboard text, or null for any other text. */
export function clipFromText(
  text: string | null | undefined,
): CanvasClip | null {
  if (!text?.includes(MARK)) {
    return null;
  }
  try {
    const data = JSON.parse(text);
    return data?.[MARK] === 1 && Array.isArray(data.nodes)
      ? {
          nodes: data.nodes,
          flows: Array.isArray(data.flows) ? data.flows : [],
          inputs: Array.isArray(data.inputs) ? data.inputs : [],
        }
      : null;
  } catch {
    return null;
  }
}

/** Copies the nodes `ids` with the flows that run between two of them. */
export function copyNodes(
  pipeline: Pipeline,
  launchRequest: LaunchRequest | null,
  ids: string[],
): CanvasClip | null {
  const picked = ids.filter((id) => pipeline.nodes.has(id));
  if (picked.length <= 0) {
    return null;
  }
  const set = new Set(picked);
  return {
    nodes: picked.map((id) => [id, toPlain(pipeline.nodes.get(id))]),
    flows: [...(pipeline.flows?.values() ?? [])]
      .filter(({ from, to }) => set.has(from) && set.has(to))
      .map((flow) => toPlain(flow)),
    inputs: picked
      .filter((id) => !!launchRequest?.nodes?.get(id)?.inputs)
      .map((id) => [id, toPlain(launchRequest.nodes.get(id))]),
  };
}

/**
 * Adds a copy of `clip` to `pipeline` with new node ids (`nodeId`) and flow
 * keys (`flowKey`), its top-left node corner at `at`. Returns the new ids.
 */
export function pasteClip(
  clip: CanvasClip,
  pipeline: Pipeline,
  launchRequest: LaunchRequest | null,
  at: Point,
  nodeId: (node: Node) => string,
  flowKey: (flow: NodeFlow) => string,
): string[] {
  const nodes = clip.nodes.map(
    ([id, plain]) => [id, toInstance(plain, Node)] as const,
  );
  const left = Math.min(...nodes.map(([, n]) => n.arrange?.x ?? 0));
  const top = Math.min(...nodes.map(([, n]) => n.arrange?.y ?? 0));

  const ids = new Map<string, string>();
  for (const [id, node] of nodes) {
    const copy = nodeId(node);
    ids.set(id, copy);
    node.arrange = Object.assign(node.arrange ?? {}, {
      x: at.x + (node.arrange?.x ?? 0) - left,
      y: at.y + (node.arrange?.y ?? 0) - top,
    });
    pipeline.nodes.set(copy, node);
  }

  pipeline.flows ??= new Map();
  for (const plain of clip.flows) {
    const flow = toInstance(plain, NodeFlow);
    flow.from = ids.get(flow.from);
    flow.to = ids.get(flow.to);
    pipeline.flows.set(flowKey(flow), flow);
  }

  if (launchRequest) {
    launchRequest.nodes ??= new Map();
    for (const [id, plain] of clip.inputs) {
      const { inputs } = toInstance(plain, NodeToLaunch);
      launchRequest.nodes.set(ids.get(id), new NodeToLaunch({ inputs }));
    }
  }

  return [...ids.values()];
}
