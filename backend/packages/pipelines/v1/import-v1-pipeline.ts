import { DataError } from "core-kit/types/errors";
import { User } from "models/user";
import { createImportedProject } from "../create-imported-project";
import { readPipelineSource } from "../read-pipeline-source";
import { adoptNodes } from "./adopt-nodes";

/**
 * Imports a Pipeline copied from Piper v1 as a new Project, its Nodes brought
 * onto what this Piper runs (see `adoptNodes`). Nothing is saved when any
 * Node can't be brought over: the DataError lists every problem. The new
 * Project is answered with `warnings` naming the Script Nodes to rewrite.
 */
export async function importV1Pipeline(user: User, source: string) {
  const imported = await readPipelineSource(source);
  const { problems, warnings } = await adoptNodes(imported.pipeline);
  if (problems.length > 0) {
    throw new DataError("Pipeline can't be imported", problems);
  }
  return { ...(await createImportedProject(user, imported)), warnings };
}
