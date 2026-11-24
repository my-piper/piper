import { ensurePipelineNodeTrust } from "packages/nodes/sign-node";
import { User } from "models/user";
import { createImportedProject } from "./create-imported-project";
import { readPipelineSource } from "./read-pipeline-source";

/**
 * Imports a Pipeline in the current format as a new Project. Its Nodes pass
 * the same trust rule as an edited Pipeline: a Script Node carries no sign
 * and no Environment, and any other Node keeps only a sign this Piper issued
 * for its script, unless the importer may re-sign it.
 */
export async function importPipeline(
  user: User,
  source: string,
  { canResign }: { canResign: boolean }
) {
  const imported = await readPipelineSource(source);
  for (const [id, node] of imported.pipeline.nodes ?? []) {
    ensurePipelineNodeTrust(node, id, canResign);
  }
  return createImportedProject(user, imported);
}
