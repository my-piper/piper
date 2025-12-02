import api from "app/api";
import mongo from "app/mongo";
import { toModel } from "core-kit/packages/transform";
import { Project } from "models/project";
import { checkAdmin, checkLogged, handle } from "utils/http";

api.get(
  "/api/projects/:_id/assistant/chat",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const project = toModel(
      await mongo.projects.findOne(
        {
          _id,
        },
        {
          projection: {
            _id: 1,
            title: 1,
            pipeline: 1,
          },
        }
      ),
      Project
    );

    if (project.createdBy?._id !== currentUser._id) {
      checkAdmin(currentUser);
    }

    return await mongo.chatMessages
      .find(
        { project: project._id },
        {
          projection: {
            _id: 1,
            project: 1,
            createdAt: 1,
            from: 1,
            message: 1,
            changes: 1,
          },
        }
      )
      .sort({ createdAt: 1 })
      .toArray();
  })
);
