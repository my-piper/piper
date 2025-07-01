import cli, { Command } from "app/cli";
import { createLogger } from "core-kit/packages/logger";
import * as packages from "packages/node-packages";

const logger = createLogger("packages");

const commands = new Command("packages");

commands.command("check-updates <id>").action(async (id: string) => {
  await packages.checkUpdates(id);
  logger.info("✅ Done");
  process.exit();
});

commands.command("plan-check-updates").action(async () => {
  await packages.planCheckUpdates();
  logger.info("✅ Done");
  process.exit();
});

commands.command("plan-update").action(async () => {
  await packages.planUpdatePackages();
  logger.info("✅ Done");
  process.exit();
});

commands.command("import <url>").action(async (url: string) => {
  await packages.importPackage(url);
  logger.info("✅ Done");
  process.exit();
});

cli.addCommand(commands);
