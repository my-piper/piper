import { Arrange } from "src/models/arrange";
import { DeployNode } from "src/models/deploy-node";
import {
  DEPLOY_NODE_SOURCE,
  Node,
  NodeDeploy,
  NodeInput,
  NodeOutput,
} from "src/models/node";
import { toInstance } from "src/utils/models";

const PREFIX = /^[a-z0-9\-_.]{3,15}$/;
const SLUG = /^[a-z0-9\-_]{5,40}$/;

export function isDeployNode(node: Node): boolean {
  return node.source === DEPLOY_NODE_SOURCE;
}

/**
 * The Deploy a text names, for adding another user's Deploy: `prefix/slug`,
 * or its link (`…/api/prefix/slug`, optionally ending in `/launch`). A bare
 * word is a search, not a Deploy.
 */
export function parseDeployRef(text: string): NodeDeploy | null {
  let path = (text ?? "").trim();
  if (!path.includes("/")) {
    return null;
  }
  try {
    path = new URL(path).pathname;
  } catch {
    // not a link: prefix/slug
  }
  const segments = path.split("/").filter(Boolean);
  const api = segments.lastIndexOf("api");
  const rest = (api >= 0 ? segments.slice(api + 1) : segments).filter(
    (s, i, all) => !(s === "launch" && i === all.length - 1),
  );
  if (rest.length === 2 && PREFIX.test(rest[0]) && SLUG.test(rest[1])) {
    return toInstance({ prefix: rest[0], slug: rest[1] }, NodeDeploy);
  }
  if (api >= 0 && rest.length === 1 && SLUG.test(rest[0])) {
    return toInstance({ slug: rest[0] }, NodeDeploy);
  }
  return null;
}

/** `prefix/slug`, or the slug of an unprefixed Deploy. */
export function deployName({ prefix, slug }: NodeDeploy): string {
  return [prefix, slug].filter(Boolean).join("/");
}

/**
 * A Deploy listed in a node palette. It isn't a real node: the canvas makes
 * one from its sockets when it is added.
 */
export function deployItem(ref: NodeDeploy, title?: string): Node {
  return toInstance(
    {
      _id: `deploy:${deployName(ref)}`,
      title: title || deployName(ref),
      source: DEPLOY_NODE_SOURCE,
      deploy: { prefix: ref.prefix, slug: ref.slug },
      category: { _id: "deploys", title: deployName(ref) },
    },
    Node,
  );
}

/**
 * The listed Deploys whose title or name contains the query, after the Deploy
 * the query names by link when it isn't listed.
 */
export function matchDeploys(deploys: Node[], query: string): Node[] {
  const text = (query ?? "").trim().toLowerCase();
  const listed = deploys.filter(
    ({ title, deploy }) =>
      !text ||
      title.toLowerCase().includes(text) ||
      deployName(deploy).includes(text),
  );
  const named = parseDeployRef(query);
  const known =
    !named ||
    listed.some(({ deploy }) => deployName(deploy) === deployName(named));
  return known ? listed : [deployItem(named), ...listed];
}

export function deploySocketsPath(ref: NodeDeploy): string {
  return ["deploys", ref.prefix, ref.slug, "sockets"].filter(Boolean).join("/");
}

// every input of a Deploy shows as a port: the Deploy's pipeline has no other
// way to fill it
function sockets({ inputs, outputs }: DeployNode) {
  return {
    inputs: new Map(
      [...(inputs ?? new Map<string, NodeInput>())].map(([id, input]) => [
        id,
        toInstance({ ...input, featured: true }, NodeInput),
      ]),
    ),
    outputs: new Map(
      [...(outputs ?? new Map<string, NodeOutput>())].map(([id, output]) => [
        id,
        toInstance({ ...output }, NodeOutput),
      ]),
    ),
  };
}

/** A Node that runs the Deploy, with its sockets copied from it. */
export function nodeFromDeploy(deploy: DeployNode): Node {
  const node = toInstance(
    {
      _id: `deploy_${deploy.slug.replace(/-/g, "_")}`.slice(0, 40),
      title: deploy.title || deploy.slug,
      source: DEPLOY_NODE_SOURCE,
      deploy: { prefix: deploy.prefix, slug: deploy.slug },
    },
    Node,
  );
  node.arrange = new Arrange();
  Object.assign(node, sockets(deploy));
  return node;
}

/**
 * How the Node no longer matches its Deploy, as the backend checks before it
 * starts the child: an input or output the Deploy doesn't declare, or a
 * required Deploy input the Node lacks. Empty when they match.
 */
export function deployProblems(node: Node, deploy: DeployNode): string[] {
  const { inputs, outputs } = sockets(deploy);
  return [
    ...[...node.inputs.keys()]
      .filter((id) => !inputs.has(id))
      .map((id) => $localize`:@@message.deploy_input_gone:input ${id} is gone`),
    ...[...inputs]
      .filter(([id, input]) => input.required && !node.inputs.has(id))
      .map(
        ([id]) =>
          $localize`:@@message.deploy_input_missing:required input ${id} is missing`,
      ),
    ...[...node.outputs.keys()]
      .filter((id) => !outputs.has(id))
      .map(
        (id) => $localize`:@@message.deploy_output_gone:output ${id} is gone`,
      ),
  ];
}

/** Re-copies the Node's sockets from its Deploy. */
export function refreshFromDeploy(node: Node, deploy: DeployNode): void {
  Object.assign(node, sockets(deploy));
  node.build();
}
