import { NODE_SIGN_SALT } from "consts/core";
import { DataError } from "core-kit/types/errors";
import crypto from "crypto";
import assign from "lodash/assign";
import { Node } from "models/node";
import { isScriptNode } from "./script-node";

export function generateSign(node: Node) {
  const { script, environment } = node;

  const scopes = [...(environment?.entries() || [])].reduce((acc, [k, v]) => {
    acc[k] = v.scope;
    return acc;
  }, {});

  return crypto
    .createHash("sha256")
    .update(
      [
        NODE_SIGN_SALT,
        (script ?? "").replace(/\s+/g, ""),
        JSON.stringify(scopes),
      ].join("\n\n")
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

// A Script Node is written by whoever edits the Pipeline, so it holds inline
// code, never carries a sign (it runs process-isolated) and never reads an
// Environment. Every other Node must keep the sign its script was issued.
export function ensurePipelineNodeTrust(
  node: Node,
  id: string,
  canResign: boolean
) {
  if (isScriptNode(node)) {
    // its script is the user's own inline code, never a published reference
    if (/^(registry:|https?:\/\/)/.test(node.script ?? "")) {
      throw new DataError(`Script Node ${id} must hold its own code`);
    }
    delete node.sign;
    delete node.environment;
    return;
  }
  ensureSign(node, id, canResign);
}
