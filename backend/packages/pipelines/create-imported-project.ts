import mongo from "app/mongo";
import { toPlain } from "core-kit/packages/transform";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { Project } from "models/project";
import { User } from "models/user";
import { cleanTitle, freeTitle, titleConflict } from "packages/projects/titles";
import { Primitive } from "types/primitive";
import { ulid } from "ulid";
import { sid } from "utils/string";
import { PipelineSource } from "./read-pipeline-source";

/**
 * Saves an imported Pipeline as a new private Project of the user, titled
 * with the Pipeline's name (numbered when another Project has it), and
 * answers it without the Pipeline's graph.
 */
export async function createImportedProject(
  user: User,
  { pipeline, launchRequest }: PipelineSource
) {
  const project = new Project({
    _id: sid(),
    revision: sid(),
    createdAt: new Date(),
    createdBy: new User({ _id: user._id }),
    title: await freeTitle(cleanTitle(pipeline.name), user._id),
    pipeline,
    launchRequest:
      launchRequest ??
      new LaunchRequest({
        inputs: new Map<string, Primitive>(),
        nodes: new Map<string, NodeToLaunch>(),
      }),
    cursor: ulid(),
  });
  const plain = toPlain(project);
  try {
    await mongo.projects.insertOne(plain as { _id: string });
  } catch (e) {
    throw titleConflict(e);
  }

  const { version, description, thumbnail } = plain["pipeline"];
  plain["pipeline"] = { version, description, thumbnail };
  delete plain["launchRequest"];
  return plain;
}
