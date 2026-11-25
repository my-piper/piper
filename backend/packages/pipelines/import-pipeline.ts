import { User } from "models/user";
import { createImportedProject } from "./create-imported-project";
import { readPipelineSource } from "./read-pipeline-source";

/** Imports a Pipeline in the current format as a new Project. */
export async function importPipeline(user: User, source: string) {
  return createImportedProject(user, await readPipelineSource(source));
}
