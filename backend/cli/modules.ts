import cli, { Command } from "app/cli";
import { createLogger } from "core-kit/packages/logger";
import { toPlain } from "core-kit/packages/transform";
import * as modules from "logic/modules";

const logger = createLogger("modules");

const commands = new Command("modules").action(async () => {
  logger.info(toPlain(await modules.list()));
  process.exit();
});

commands.command("remove <name>").action(async (name: string) => {
  logger.info(`Remove ${name}`);
  await modules.remove(name);
  logger.info("✅ Done");
  process.exit();
});

commands
  .command("add <name> <version>")
  .action(async (name: string, version: string) => {
    logger.info(`Install ${name} ${version}`);
    await modules.add(name, version);
    logger.info("✅ Done");
    process.exit();
  });

commands.command("update").action(async ({ name }: { name: string }) => {
  logger.info("Update modules");
  await modules.update();
  logger.info("✅ Done");
  process.exit();
});

cli.addCommand(commands);
