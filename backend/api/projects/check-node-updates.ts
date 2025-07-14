import api from "app/api";
import mongo from "app/mongo";
import { mapTo, toPlain } from "core-kit/packages/transform";
import { NotFoundError } from "core-kit/types/errors";
import assign from "lodash/assign";
import { Node, NodeToUpdate, PipelineNodeUpdates } from "models/node";
import { Project } from "models/project";
import { checkLogged, handle, toModel } from "utils/http";

api.get(
  "/api/projects/:_id/check-node-updates",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const project = toModel(await mongo.projects.findOne({ _id }), Project);
    const { pipeline } = project;

    const updates = new Map<string, NodeToUpdate>();

    for (const [id, node] of pipeline.nodes) {
      if (node.source !== "catalog") {
        continue;
      }

      const { _id, version } = node;

      let updated!: Node;

      try {
        updated = toModel(
          await mongo.nodes.findOne({ _id, version: { $gt: version } }),
          Node
        );
      } catch (e) {
        if (e instanceof NotFoundError) {
          continue;
        }
      }

      updates.set(
        id,
        mapTo(
          {
            current: (() => {
              const plain = toPlain(node);
              delete plain["title"];
              delete plain["arrange"];
              delete plain["source"];
              delete plain["locked"];
              return plain;
            })(),
            changes: (() => {
              const plain = toPlain(updated);
              delete plain["title"];
              delete plain["arrange"];
              delete plain["source"];
              delete plain["locked"];
              return plain;
            })(),
            updated: (() => {
              const { title, arrange, source, locked } = node;
              assign(updated, { title, arrange, source, locked });
              return updated;
            })(),
          },
          NodeToUpdate
        )
      );
    }

    return toPlain(mapTo({ updates }, PipelineNodeUpdates));
  })
);
