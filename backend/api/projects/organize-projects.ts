import api from "app/api";
import mongo from "app/mongo";
import { allLabels } from "core-kit/utils/i18n";
import { mapTo, toModels, toPlain } from "core-kit/utils/models";
import { ProjectVisibility } from "enums/project-visibility";
import assign from "lodash/assign";
import "reflect-metadata";
import { checkAdmin, handle } from "utils/http";
import { Project } from "../../models/project";
import { ProjectTag } from "./models/project-tag";

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
              "pipeline.tags": 1,
            },
          }
        )
        .toArray(),
      Project
    );

    await mongo.projectTags.deleteMany({});
    const allTags: ProjectTag[] = [];

    for (const project of projects) {
      // category
      const { category, tags } = project.pipeline;
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

      // add tags
      if (tags?.length > 0) {
        for (const tag of tags) {
          const labels = allLabels(tag);
          for (const [language, label] of Object.entries(labels)) {
            allTags.push(
              mapTo(
                {
                  tag: label,
                  project: project._id,
                  language,
                },
                ProjectTag
              )
            );
          }
        }
      }
    }

    if (allTags.length > 0) {
      await mongo.projectTags.insertMany(allTags);
    }

    return null;
  })
);
