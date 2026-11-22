import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { Node } from "models/node";

export const SCRIPT_NODE_ID = "script";

/**
 * Marks a Script Node in a Pipeline: its user writes its inputs, outputs and
 * script, so it is never signed, never reads an Environment and is never
 * replaced by a catalog update.
 */
export const SCRIPT_NODE_SOURCE = "script";

const TITLE = "en=Script;ru=Скрипт";

const SCRIPT = `export async function run({ inputs }) {
  // inputs hold the values of the inputs declared on this node
  return {
    __type: "next",
    outputs: {},
  };
}
`;

export function isScriptNode(node: Pick<Node, "source">) {
  return node.source === SCRIPT_NODE_SOURCE;
}

/** The catalog can't hold a Node under the Script Node's id: it would be hidden. */
export function checkNodeIdFree(id: string) {
  if (id === SCRIPT_NODE_ID) {
    throw new DataError(`Node id ${id} is reserved`);
  }
}

// matched against each translated title, not the raw "en=…;ru=…" string
export function matchesScriptNode(search?: string) {
  if (!search) {
    return true;
  }
  const pattern = new RegExp(search, "i");
  return TITLE.split(";").some((title) => pattern.test(title.split("=")[1]));
}

/** The Script Node, available to every user without a Node Package. */
export function scriptNode() {
  return toInstance(
    {
      _id: SCRIPT_NODE_ID,
      version: 1,
      title: TITLE,
      description:
        "en=Runs your own JavaScript with the inputs and outputs you define;ru=Запускает ваш JavaScript с входами и выходами, которые вы задаёте",
      category: {
        _id: "builtin",
        title: "en=Built-in;ru=Встроенные",
        order: -1,
      },
      icon: "code",
      order: 0,
      tags: ["script", "javascript"],
      source: SCRIPT_NODE_SOURCE,
      execution: "regular",
      script: SCRIPT,
      inputs: {},
      outputs: {},
    },
    Node
  );
}
