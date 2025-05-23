import cli, { Command } from "app/cli";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain, validate } from "core-kit/packages/transform";
import { decrypt, encrypt } from "logic/environment/crypt-environment";
import { merge } from "logic/environment/merge-environment";
import { Environment } from "models/environment";
import { Primitive } from "types/primitive";

const logger = createLogger("environment");

const commands = new Command("env").action(async () => {
  const json = await redis.get(GLOBAL_ENVIRONMENT_KEY);
  const environment = !!json
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
    const global = !!json
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
  const environment = !!json
    ? toInstance(JSON.parse(json), Environment)
    : new Environment({
        variables: new Map<string, Primitive>(),
      });

  environment.variables.delete(name);
  await redis.set(GLOBAL_ENVIRONMENT_KEY, JSON.stringify(toPlain(environment)));
  logger.info("✅ Done");
  process.exit();
});

cli.addCommand(commands);
