import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { Project } from "../../models/project";
import { checkAdmin, checkLogged, handle, toModel } from "../../utils/http";

api.delete(
  "/api/projects/:_id",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    checkLogged(currentUser);

    const project = toModel(
      await mongo.projects.findOne(
        {
          _id,
        },
        {
          projection: {
            createdBy: 1,
          },
        }
      ),
      Project
    );
    if (project.createdBy?._id !== currentUser._id) {
      checkAdmin(currentUser);
    }

    await mongo.projects.deleteOne({ _id });
    return null;
  })
);
