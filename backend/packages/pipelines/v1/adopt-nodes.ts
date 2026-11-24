import mongo from "app/mongo";
import { toInstance } from "core-kit/packages/transform";
import { Node } from "models/node";
import { Pipeline } from "models/pipeline";
import { SCRIPT_NODE_SOURCE, isScriptNode } from "packages/nodes/script-node";
import { isScriptReference } from "packages/nodes/sign-node";
import { fromV1Script, isV1Script, v1ScriptProblems } from "./v1-script";

/** Node Definitions renamed since Piper v1: v1 id -> current id. */
const RENAMED_DEFINITIONS: Record<string, string> = {
  ask_llm_artworks: "ask_llm_agent",
};

type Ports = { inputs: Set<string>; outputs: Set<string> };

/** The inputs and outputs of each Node that a Flow reaches. */
function portsInFlows(pipeline: Pipeline) {
  const ports = new Map<string, Ports>();
  const of = (node: string) => {
    if (!ports.has(node)) {
      ports.set(node, noPorts());
    }
    return ports.get(node);
  };

  for (const flow of pipeline.flows?.values() ?? []) {
    of(flow.from).outputs.add(flow.output);
    of(flow.to).inputs.add(flow.input);
  }
  for (const input of pipeline.inputs?.values() ?? []) {
    for (const flow of input.flows?.values() ?? []) {
      of(flow.to).inputs.add(flow.input);
    }
  }
  for (const output of pipeline.outputs?.values() ?? []) {
    for (const flow of output.flows?.values() ?? []) {
      of(flow.from).outputs.add(flow.output);
    }
  }
  return ports;
}

function missingPorts(definition: Node, ports: Ports) {
  return [
    ...[...ports.inputs]
      .filter((id) => !definition.inputs?.has(id))
      .map((id) => `input ${id}`),
    ...[...ports.outputs]
      .filter((id) => !definition.outputs?.has(id))
      .map((id) => `output ${id}`),
  ];
}

type Lookup = { definition?: Node; mismatch?: string };

/** The installed Node Definition a Node stands for, by its id, then its key. */
async function findDefinition(
  key: string,
  node: Node,
  ports: Ports
): Promise<Lookup> {
  const ids = [...new Set([node._id, key].filter(Boolean))].map(
    (id) => RENAMED_DEFINITIONS[id] ?? id
  );

  let mismatch: string = null;
  for (const id of ids) {
    const found = await mongo.nodes.findOne({ _id: id });
    if (!found || (found["package"] ?? null) !== (node.package ?? null)) {
      continue;
    }

    delete found["catalog"];
    const definition = toInstance(found as object, Node);
    const missing = missingPorts(definition, ports);
    if (missing.length === 0) {
      return { definition };
    }
    mismatch ??= `Node Definition ${id} has no ${missing.join(", ")}`;
  }
  return { mismatch };
}

/** Problems about one Node, each led by the Node's key and package. */
function aboutNode(key: string, node: Node, problems: string[]) {
  const label = node.package ? `Node ${key} (${node.package})` : `Node ${key}`;
  return problems.map((problem) => `${label}: ${problem}`);
}

function noPorts(): Ports {
  return { inputs: new Set(), outputs: new Set() };
}

/** Turns a Node its user wrote into a Script Node, or says why it can't. */
function toScriptNode(node: Node): string[] {
  const script = node.script ?? "";
  if (isScriptReference(script)) {
    return ["points at published code, which a Script Node can't run"];
  }
  const problems = v1ScriptProblems(script);
  if (problems.length > 0) {
    return problems;
  }

  node.source = SCRIPT_NODE_SOURCE;
  node.script = isV1Script(script) ? fromV1Script(script) : script;
  delete node.sign;
  delete node.environment;
  return [];
}

/**
 * Brings the Nodes of an imported Pipeline to what this Piper runs: a Node
 * from a Node Package becomes its installed Node Definition, standing where it
 * stood, and a Node its user wrote becomes a Script Node. Every input a Flow
 * reaches is made a port, since the editor drops Flows into other inputs.
 * Returns the problems that keep the Pipeline from being imported.
 */
export async function adoptNodes(pipeline: Pipeline): Promise<string[]> {
  const problems: string[] = [];
  const ports = portsInFlows(pipeline);

  for (const [key, node] of pipeline.nodes ?? new Map<string, Node>()) {
    const used = ports.get(key) ?? noPorts();

    if (isScriptNode(node)) {
      problems.push(...aboutNode(key, node, toScriptNode(node)));
      continue;
    }

    const lookup = await findDefinition(key, node, used);
    if (lookup.definition) {
      lookup.definition.arrange = node.arrange;
      pipeline.nodes.set(key, lookup.definition);
      continue;
    }

    if (node.package) {
      problems.push(
        ...aboutNode(key, node, [
          lookup.mismatch ?? "no installed Node Definition matches it",
        ])
      );
      continue;
    }

    problems.push(...aboutNode(key, node, toScriptNode(node)));
  }

  for (const [key, { inputs }] of ports) {
    const node = pipeline.nodes?.get(key);
    for (const id of inputs) {
      const input = node?.inputs?.get(id);
      if (input) {
        input.featured = true;
      }
    }
  }

  return problems;
}
