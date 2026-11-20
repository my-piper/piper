import { NODE_SIGN_SALT } from "consts/core";
import { DataError } from "core-kit/types/errors";
import crypto from "crypto";
import assign from "lodash/assign";
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
      [NODE_SIGN_SALT, (script ?? "").replace(/\s+/g, ""), JSON.stringify(scopes)].join(
        "\n\n"
      )
    )
    .digest("hex");
}

// Users allowed to change node scripts (engineers) get their nodes re-signed.
// Anyone else must submit the sign the server issued for exactly this script.
export function ensureSign(node: Node, id: string, canResign: boolean) {
  const sign = generateSign(node);
  if (sign === node.sign) {
    return;
  }
  if (!canResign) {
    throw new DataError(`Wrong sign for ${id} node`);
  }
  assign(node, { sign });
}
