import api from "app/api";
import mongo from "app/mongo";
import { plainToInstance } from "class-transformer";
import { DataError } from "core-kit/types/errors";
import { toPlain } from "core-kit/utils/models";
import { ulid } from "ulid";
import { checkLogged, handle } from "utils/http";
import ajv from "../../app/ajv";
import { Project } from "../../models/project";
import { User } from "../../models/user";
import SCHEMAS from "../../schemas/compiled.json" with { type: "json" };
import { sid } from "../../utils/string";

api.post(
  "/api/projects",
  handle(({ currentUser }) => async ({ body }) => {
    checkLogged(currentUser);

    const request = plainToInstance(Project, body);
    const { title, pipeline, launchRequest } = request;

    const project = new Project({
      _id: sid(),
      revision: sid(),
      createdAt: new Date(),
      createdBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      title,
      visibility: "private",
      pipeline,
      launchRequest,
      cursor: ulid(),
    });
    const plain = toPlain(project);
    const validate = ajv.compile(SCHEMAS.project);
    if (!validate(plain)) {
      const { errors } = validate;
      throw new DataError(
        "Project schema invalid",
        errors.map(
          (e) =>
            `${e.propertyName || e.instancePath || e.schemaPath}: ${e.message}`
        )
      );
    }
    await mongo.projects.insertOne(plain as { _id: string });

    delete plain["pipeline"];
    delete plain["launchRequest"];
    return plain;
  })
);
