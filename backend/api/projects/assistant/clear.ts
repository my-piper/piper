import api from "app/api";
import mongo from "app/mongo";
import { toModel } from "core-kit/packages/transform";
import { Project } from "models/project";
import { checkAdmin, checkLogged, handle } from "utils/http";

api.post(
  "/api/projects/:_id/assistant/clear",
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
            createdBy: 1,
          },
        }
      ),
      Project
    );

    if (project.createdBy?._id !== currentUser._id) {
      checkAdmin(currentUser);
    }

    await mongo.chatMessages.deleteMany({ project: project._id });
    return null;
  })
);
