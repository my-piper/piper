import cli, { Command } from "app/cli";
import mongo from "app/mongo";
import {
  GLOBAL_ENVIRONMENT_KEY,
  LEGACY_USER_ENVIRONMENT_PREFIX,
} from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { Environment } from "models/environment";
import { Project } from "models/project";
import { decrypt, encrypt } from "packages/environment/crypt-environment";
import { merge } from "packages/environment/merge-environment";
import { overridesFromUserEnvironment } from "packages/environment/user-environment-migration";
import { Primitive } from "types/primitive";

const logger = createLogger("environment");

const commands = new Command("env").action(async () => {
  const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
  const environment = json
    ? toInstance(JSON.parse(json), Environment)
    : new Environment({
        variables: new Map<string, Primitive>(),
      });

  decrypt(environment);
  logger.info(toPlain(environment));
  process.exit();
});

commands
  .command("set <name> <value>")
  .action(async (name: string, value: string) => {
    console.log(`Set variable ${name} ${value}`);
    const environment = new Environment({
      variables: new Map<string, Primitive>(),
    });
    environment.variables.set(name, value);
    await validate(environment);

    encrypt(environment);

    const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
    const global = json
      ? toInstance(JSON.parse(json), Environment)
      : new Environment({
          variables: new Map<string, Primitive>(),
        });

    merge(global, environment);
    await redis.set(GLOBAL_ENVIRONMENT_KEY, JSON.stringify(toPlain(global)));
    logger.info("✅ Done");
    process.exit();
  });

commands.command("remove <name>").action(async (name: string) => {
  console.log(`Remove variable ${name}`);
  const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
  const environment = json
    ? toInstance(JSON.parse(json), Environment)
    : new Environment({
        variables: new Map<string, Primitive>(),
      });

  environment.variables.delete(name);
  await redis.set(GLOBAL_ENVIRONMENT_KEY, JSON.stringify(toPlain(environment)));
  logger.info("✅ Done");
  process.exit();
});

/**
 * One-off move away from User Environments: each User Variable an owner's
 * Project or Deploy read becomes that Project's or Deploy's own value, then
 * the User Environment is deleted. Nothing is merged into the Global
 * Environment.
 */
commands
  .command("migrate-user-environments")
  .option("--dry-run", "report what would change without writing")
  .action(async ({ dryRun }: { dryRun?: boolean }) => {
    const keys = await redis.keys(`${LEGACY_USER_ENVIRONMENT_PREFIX}*`);
    for (const key of keys) {
      const owner = key.slice(LEGACY_USER_ENVIRONMENT_PREFIX.length);
      const json = await redis.get(key);
      if (!json) {
        continue;
      }
      const user = toInstance(JSON.parse(json), Environment);
      const used = new Set<string>();

      const projects = await mongo.projects
        .find(
          { "createdBy._id": owner },
          { projection: { pipeline: 1, environment: 1 } }
        )
        .toArray();
      const deploys = await mongo.deploys
        .find(
          {
            // a regular user's Deploys live under their own prefix, even
            // when the Project is gone
            $or: [
              { "project._id": { $in: projects.map(({ _id }) => _id) } },
              { prefix: owner },
            ],
          },
          { projection: { pipeline: 1, environment: 1 } }
        )
        .toArray();
      for (const [label, collection, documents] of [
        ["Project", mongo.projects, projects],
        ["Deploy", mongo.deploys, deploys],
      ] as const) {
        for (const plain of documents) {
          const { _id, pipeline, environment } = toInstance(plain, Project);
          const migrated = overridesFromUserEnvironment(
            pipeline,
            environment,
            user
          );
          migrated.used.forEach((name) => used.add(name));
          logger.info(
            `${label} ${_id}: ${[...migrated.used].join(", ") || "-"}`
          );
          if (migrated.unresolved.length > 0) {
            logger.warn(
              `${label} ${_id} binds missing User Variables, now read from the Global Environment: ${migrated.unresolved.join(", ")}`
            );
          }
          if (!dryRun && migrated.used.size > 0) {
            await collection.updateOne(
              { _id },
              { $set: { environment: toPlain(migrated.environment) } }
            );
          }
        }
      }

      const dropped = [...(user.variables?.keys() ?? [])].filter(
        (name) => !used.has(name)
      );
      logger.info(`User ${owner} drops: ${dropped.join(", ") || "-"}`);
      if (!dryRun) {
        await redis.del(key);
      }
    }
    logger.info("✅ Done");
    process.exit();
  });

cli.addCommand(commands);
