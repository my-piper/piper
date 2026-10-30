import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { Project } from "models/project";
import { User } from "models/user";
import { checkAdmin, checkLogged, handle, toModel } from "utils/http";
import { ProjectSettings } from "./models/project-settings";

api.post(
  "/api/projects/:_id/settings",
  handle(({ currentUser }) => async ({ params: { _id }, body }) => {
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

    const settings = toInstance(body, ProjectSettings);
    await validate(settings);

    const update = new Project({
      // empty value removes the project from its group
      group: settings.group?.trim() || null,
      updatedBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      updatedAt: new Date(),
    });

    const plain = toPlain(update);
    await mongo.projects.updateOne({ _id }, { $set: plain });
    return plain;
  })
);
