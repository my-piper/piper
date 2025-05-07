import ajv from "app/ajv";
import api from "app/api";
import mongo from "app/mongo";
import { DataError } from "core-kit/types/errors";
import { toInstance, toPlain } from "core-kit/utils/models";
import { Project } from "models/project";
import { User } from "models/user";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { checkAdmin, checkLogged, handle, toModel } from "utils/http";

api.post(
  "/api/projects/:_id",
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

    const request = toInstance(body, Project);
    const validate = ajv.compile(SCHEMAS.project);
    if (!validate(request)) {
      const { errors } = validate;
      throw new DataError(
        "Pipeline schema invalid",
        errors.map((e) =>
          [
            e.propertyName || e.instancePath || e.schemaPath,
            e.message,
            JSON.stringify(e.params),
          ].join(": ")
        )
      );
    }

    const { visibility, slug, order } = request;

    const update = new Project({
      visibility,
      slug,
      order,
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
