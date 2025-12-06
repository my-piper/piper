import ajv from "app/ajv";
import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { DataError, NotFoundError } from "core-kit/types/errors";
import { patch } from "jsondiffpatch";
import assign from "lodash/assign";
import { Environment } from "models/environment";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import { Project } from "models/project";
import { User } from "models/user";
import { decrypt, encrypt } from "packages/environment/crypt-environment";
import { generateSign } from "packages/nodes/sign-node";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { Primitive } from "types/primitive";
import {
  checkAdmin,
  checkLogged,
  handle,
  isAdmin,
  isEngineer,
  toModel,
} from "utils/http";
import { sid } from "utils/string";
import { PatchProject } from "./models/update-project";

api.patch(
  "/api/projects/:_id/patch/:revision",
  handle(({ currentUser }) => async ({ params: { _id, revision }, body }) => {
    checkLogged(currentUser);

    const request = body as PatchProject;
    await validate(request);

    const project = toModel(
      await mongo.projects.findOne<{ pipeline: Object }>(
        {
          _id,
        },
        {
          projection: {
            revision: 1,
            createdBy: 1,
            ...(!!request.pipeline ? { pipeline: 1 } : {}),
            ...(!!request.launchRequest ? { launchRequest: 1 } : {}),
            ...(!!request.environment ? { environment: 1 } : {}),
          },
        }
      ),
      Project
    );
    if (project.createdBy?._id !== currentUser._id) {
      checkAdmin(currentUser);
    }
    if (revision !== project.revision) {
      throw new DataError(
        `Version on sever is more fresh version ${project.revision}`
      );
    }
    const { createdBy } = project;
    if (createdBy._id !== currentUser._id) {
      checkAdmin(currentUser);
    }

    const update = new Project({
      revision: sid(),
      // TODO: remove then
      createdBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      updatedBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      updatedAt: new Date(),
    });

    if (!!request.pipeline) {
      const forPatch = toPlain(project.pipeline);
      patch(forPatch, request.pipeline);

      const validate = ajv.compile(SCHEMAS.pipeline);
      if (!validate(forPatch)) {
        const { errors } = validate;
        console.error(JSON.stringify(forPatch, null, "\t"));
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

      const patched = toInstance(forPatch, Pipeline);
      const { name: title, thumbnail } = patched;

      if (!!patched.script && !isAdmin(currentUser)) {
        throw new DataError("You can't edit pipeline script");
      }

      for (const [id, node] of patched.nodes) {
        const sign = generateSign(node);
        if (sign !== node.sign) {
          if (isEngineer(currentUser)) {
            assign(node, { sign });
          } else {
            throw new DataError(`Wrong sign for ${id} node`);
          }
        }
      }

      assign(update, {
        title,
        thumbnail,
        pipeline: patched,
      });
    }

    if (!!request.launchRequest) {
      const forPatch = toPlain(
        project.launchRequest ??
          new LaunchRequest({
            inputs: new Map<string, Primitive>(),
            nodes: new Map<string, NodeToLaunch>(),
          })
      );
      patch(forPatch, request.launchRequest);

      const patched = toInstance(forPatch, LaunchRequest);
      await validate(patched);

      assign(update, { launchRequest: patched });
    }

    if (!!request.environment) {
      const forPatch = toPlain(
        (() => {
          const { environment } = project;
          if (!!environment) {
            decrypt(environment);
            return environment;
          }

          return new Environment({
            variables: new Map<string, Primitive>(),
          });
        })()
      );
      patch(forPatch, request.environment);

      const patched = toInstance(forPatch, Environment);
      await validate(patched);

      encrypt(patched);
      assign(update, { environment: patched });
    }

    const { matchedCount } = await mongo.projects.updateOne(
      { _id },
      { $set: toPlain(update) }
    );
    if (matchedCount <= 0) {
      throw new NotFoundError();
    }

    assign(project, update);

    const plain = toPlain(project);
    delete plain["_id"];
    delete plain["title"];
    delete plain["pipeline"];
    delete plain["launchRequest"];
    delete plain["environment"];

    return plain;
  })
);
