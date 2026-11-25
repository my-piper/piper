import cli, { Command } from "app/cli";
import mongo from "app/mongo";
import {
  GLOBAL_ENVIRONMENT_KEY,
  LEGACY_USER_ENVIRONMENT_PREFIX,
} from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { Deploy } from "models/deploy";
import { Environment } from "models/environment";
import { Project } from "models/project";
import { decrypt, encrypt } from "packages/environment/crypt-environment";
import { merge } from "packages/environment/merge-environment";
import { declaredVariables } from "packages/environment/prune-environment";
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
 * Project read becomes that Project's own value, then the User Environment is
 * deleted. Deploys are left alone: a Deploy read the caller's User
 * Environment, so copying the owner's values would hand them to every caller.
 * Nothing is merged into the Global Environment.
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
      for (const plain of projects) {
        const { _id, pipeline, environment } = toInstance(plain, Project);
        const migrated = overridesFromUserEnvironment(
          pipeline,
          environment,
          user
        );
        migrated.used.forEach((name) => used.add(name));
        logger.info(`Project ${_id}: ${[...migrated.used].join(", ") || "-"}`);
        if (migrated.unresolved.length > 0) {
          logger.warn(
            `Project ${_id} binds missing User Variables, now read from the Global Environment: ${migrated.unresolved.join(", ")}`
          );
        }
        if (!dryRun && migrated.used.size > 0) {
          await mongo.projects.updateOne(
            { _id },
            { $set: { environment: toPlain(migrated.environment) } }
          );
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

    // a Deploy whose Variables its callers set in their User Environment now
    // reads the Global Environment; its owner redeploys with overrides
    const deploys = await mongo.deploys
      .find(
        {},
        { projection: { prefix: 1, slug: 1, pipeline: 1, environment: 1 } }
      )
      .toArray();
    for (const plain of deploys) {
      const { prefix, slug, pipeline, environment } = toInstance(plain, Deploy);
      const unset = [...declaredVariables(pipeline)].filter(
        (name) => !environment?.variables?.has(name)
      );
      if (unset.length > 0) {
        logger.warn(
          `Deploy ${prefix}/${slug} now reads from the Global Environment: ${unset.join(", ")}`
        );
      }
    }
    logger.info("✅ Done");
    process.exit();
  });

cli.addCommand(commands);
