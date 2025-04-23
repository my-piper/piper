import api from "app/api";
import mongo from "app/mongo";
import { checkLogged, handle } from "utils/http";

api.get(
  "/api/projects/tags",
  handle(({ currentUser, language }) => async () => {
    checkLogged(currentUser);

    const tags = await mongo.projectTags
      .aggregate([
        { $match: { language } },
        { $group: { _id: "$tag" } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, tag: "$_id" } },
      ])
      .toArray();

    return tags.map((t) => t.tag);
  })
);
