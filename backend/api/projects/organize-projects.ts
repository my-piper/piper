import { mapTo, toModels, toPlain } from "core-kit/utils/models";
import { ProjectVisibility } from "enums/project-visibility";
import assign from "lodash/assign";
import "reflect-metadata";
import { api } from "../../app/api";
import mongo from "../../app/mongo";
import { Project } from "../../models/project";
import { checkAdmin, handle } from "../../utils/http";

api.post(
  "/api/projects/organize",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);

    const projects = toModels(
      await mongo.projects
        .find(
          {
            visibility: ProjectVisibility.public,
          },
          {
            projection: {
              "pipeline.category": 1,
            },
          }
        )
        .toArray(),
      Project
    );

    for (const project of projects) {
      const { category } = project.pipeline;
      if (!!category) {
        const { _id } = category;
        assign(category, {
          projects: projects.filter((p) => p.pipeline.category?._id === _id)
            .length,
        });
        await mongo.projectCategories.updateOne(
          { _id },
          { $set: toPlain(category) },
          {
            upsert: true,
          }
        );

        await mongo.projects.updateOne(
          { _id: project._id },
          {
            $set: toPlain(
              mapTo(
                {
                  category: { _id },
                },
                Project
              )
            ),
          }
        );
      }
    }

    return null;
  })
);
