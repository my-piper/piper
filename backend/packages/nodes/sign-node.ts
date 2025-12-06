import { NODE_SIGN_SALT } from "consts/core";
import crypto from "crypto";
import { Node } from "models/node";

export function generateSign(node: Node) {
  const { script, environment } = node;

  const scopes = [...(environment?.entries() || [])].reduce((acc, [k, v]) => {
    acc[k] = v.scope;
    return acc;
  }, {});

  return crypto
    .createHash("sha256")
    .update(
      [NODE_SIGN_SALT, script.replace(/\s+/g, ""), JSON.stringify(scopes)].join(
        "\n\n"
      )
    )
    .digest("hex");
}
