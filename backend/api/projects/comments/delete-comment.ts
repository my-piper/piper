import api from "app/api";
import mongo from "app/mongo";
import { checkAdmin, handle } from "utils/http";

api.delete(
  "/api/projects/:project/comments/:_id",
  handle(({ currentUser }) => async ({ params: { project, _id } }) => {
    checkAdmin(currentUser);

    await mongo.projectComments.deleteOne({ _id, project });
    return null;
  })
);
