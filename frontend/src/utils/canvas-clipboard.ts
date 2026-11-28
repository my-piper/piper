import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { toPlain } from "src/utils/models";

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
