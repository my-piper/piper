import mongo from "app/mongo";
import { toInstance } from "core-kit/packages/transform";
import { Node } from "models/node";
import { Pipeline } from "models/pipeline";
import { SCRIPT_NODE_SOURCE, isScriptNode } from "packages/nodes/script-node";
import { isScriptReference } from "packages/nodes/sign-node";
import {
  fromV1Script,
  isV1Script,
  v1ScriptProblems,
  v1ScriptWarnings,
} from "./v1-script";

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

/**
 * What the lookup found: the Definition, or why none fits. `stoodFor` names
 * the Definition the Node's name stands for when its ports chose another.
 */
type Lookup = { definition?: Node; mismatch?: string; stoodFor?: string };

function toDefinition(found: object) {
  delete found["catalog"];
  return toInstance(found, Node);
}

/**
 * The only Node Definition of the package that has every used port. A v1 Node
 * could be an edited copy of a catalog Node: its name then stands for another
 * Definition, and its ports tell which one it became.
 */
async function findByPorts(pkg: string, ports: Ports) {
  if (ports.inputs.size + ports.outputs.size === 0) {
    return null;
  }
  const matching = (await mongo.nodes.find({ package: pkg }).toArray())
    .map((found) => toDefinition(found as object))
    .filter((definition) => missingPorts(definition, ports).length === 0);
  return matching.length === 1 ? matching[0] : null;
}

/**
 * The installed Node Definition a Node stands for: by its id, then its key.
 * When the one its name stands for lacks its ports, a package Node takes the
 * one Definition of its package that has them.
 */
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

    const definition = toDefinition(found as object);
    const missing = missingPorts(definition, ports);
    if (missing.length === 0) {
      return { definition };
    }
    mismatch ??= `Node Definition ${id} has no ${missing.join(", ")}`;
  }

  if (mismatch && node.package) {
    const definition = await findByPorts(node.package, ports);
    if (definition) {
      return { definition, stoodFor: mismatch };
    }
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

type Adoption = { problems: string[]; warnings: string[] };

/**
 * Turns a Node its user wrote into a Script Node, or says why it can't. The
 * warnings name what of a v1 script must be rewritten before it runs.
 */
function toScriptNode(node: Node): Adoption {
  const script = node.script ?? "";
  if (isScriptReference(script)) {
    return {
      problems: ["points at published code, which a Script Node can't run"],
      warnings: [],
    };
  }
  const problems = v1ScriptProblems(script);
  if (problems.length > 0) {
    return { problems, warnings: [] };
  }

  node.source = SCRIPT_NODE_SOURCE;
  node.script = isV1Script(script) ? fromV1Script(script) : script;
  delete node.sign;
  const declared = [...(node.environment?.keys() ?? [])];
  delete node.environment;
  return { problems: [], warnings: v1ScriptWarnings(script, declared) };
}

/**
 * Brings the Nodes of an imported Pipeline to what this Piper runs: a Node
 * from a Node Package becomes its installed Node Definition, standing where it
 * stood, and a Node its user wrote becomes a Script Node. Every input a Flow
 * reaches is made a port, since the editor drops Flows into other inputs.
 * Returns the problems that keep the Pipeline from being imported and the
 * warnings about Script Nodes to rewrite before they run.
 */
export async function adoptNodes(pipeline: Pipeline): Promise<Adoption> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const ports = portsInFlows(pipeline);
  const asScript = (key: string, node: Node) => {
    const adoption = toScriptNode(node);
    problems.push(...aboutNode(key, node, adoption.problems));
    warnings.push(...aboutNode(key, node, adoption.warnings));
  };

  for (const [key, node] of pipeline.nodes ?? new Map<string, Node>()) {
    const used = ports.get(key) ?? noPorts();

    if (isScriptNode(node)) {
      asScript(key, node);
      continue;
    }

    const lookup = await findDefinition(key, node, used);
    if (lookup.definition) {
      if (lookup.stoodFor) {
        warnings.push(
          ...aboutNode(key, node, [
            `${lookup.stoodFor}, so it became ${lookup.definition._id}, which has them`,
          ])
        );
      }
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

    asScript(key, node);
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

  return { problems, warnings };
}
