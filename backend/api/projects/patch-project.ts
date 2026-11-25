import ajv from "app/ajv";
import api from "app/api";
import mongo from "app/mongo";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { DataError, NotFoundError } from "core-kit/types/errors";
import { patch } from "jsondiffpatch/with-text-diffs";
import assign from "lodash/assign";
import { Environment } from "models/environment";
import { LaunchRequest, NodeToLaunch } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import { Project } from "models/project";
import { User } from "models/user";
import { decrypt, encrypt } from "packages/environment/crypt-environment";
import { applyBindings } from "packages/environment/bind-environment";
import { hide } from "packages/environment/hide-environment";
import { pruneEnvironment } from "packages/environment/prune-environment";
import { dropRevealedSecrets } from "packages/environment/reveal-environment";
import { isSecretPlaceholder } from "packages/environment/secret-placeholder";
import { renameV1Variables } from "packages/environment/v1-variables";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import { Primitive } from "types/primitive";
import { checkAdmin, checkLogged, handle, isAdmin, toModel } from "utils/http";
import { sid } from "utils/string";
import { PatchProject } from "./models/update-project";

api.patch(
  "/api/projects/:_id/patch/:revision",
  handle(({ currentUser }) => async ({ params: { _id, revision }, body }) => {
    checkLogged(currentUser);

    const request = body as PatchProject;
    await validate(request);

    const project = toModel(
      await mongo.projects.findOne<{ pipeline: object }>(
        {
          _id,
        },
        {
          projection: {
            revision: 1,
            createdBy: 1,
            ...(request.launchRequest ? { launchRequest: 1 } : {}),
            // the Project Environment is pruned to what the pipeline declares
            ...(request.pipeline || request.environment
              ? { pipeline: 1, environment: 1 }
              : {}),
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
      updatedBy: (() => {
        const { _id } = currentUser;
        return new User({ _id });
      })(),
      updatedAt: new Date(),
    });

    if (request.pipeline) {
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
      const { name: title, tags, thumbnail } = patched;

      if (!!patched.script && !isAdmin(currentUser)) {
        throw new DataError("You can't edit pipeline script");
      }

      assign(update, {
        title,
        tags,
        thumbnail,
        pipeline: patched,
      });
    }

    if (request.launchRequest) {
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

    if (request.environment) {
      const stored =
        project.environment ??
        new Environment({ variables: new Map<string, Primitive>() });
      // the delta applies to what the client sees, never to a plain secret
      const shown = toInstance(toPlain(stored), Environment);
      hide(shown);
      const forPatch = toPlain(shown);
      patch(forPatch, request.environment);

      const patched = toInstance(forPatch, Environment);
      await validate(patched);
      decrypt(stored);
      // a placeholder under a v1 name keeps the value stored under either name
      renameV1Variables(stored);
      renameV1Variables(
        patched,
        (name) => patched.variables?.get(name) !== shown.variables?.get(name)
      );
      const changed = new Set<string>();
      for (const [k, v] of patched.variables ?? new Map<string, Primitive>()) {
        if (isSecretPlaceholder(v)) {
          const secret = stored.variables?.get(k);
          if (typeof secret === "string") {
            patched.variables.set(k, secret);
          } else {
            patched.variables.delete(k);
          }
        } else if (v !== shown.variables?.get(k)) {
          changed.add(k);
        }
      }
      dropRevealedSecrets(patched, stored.visible, changed);
      applyBindings(patched);
      pruneEnvironment(patched, update.pipeline ?? project.pipeline);

      encrypt(patched);
      assign(update, { environment: patched });
    } else if (
      update.pipeline &&
      project.environment &&
      pruneEnvironment(project.environment, update.pipeline)
    ) {
      // values stay encrypted: pruning only drops names
      assign(update, { environment: project.environment });
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
