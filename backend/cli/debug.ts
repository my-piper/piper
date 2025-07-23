import cli, { Command } from "app/cli";
import { createLogger } from "core-kit/packages/logger";
import { readFile } from "fs/promises";

const logger = createLogger("debug");

const commands = new Command("debug");

commands.command("server").action(async (name: string) => {
  const pid = parseInt(await readFile("server.pid", "utf8"));
  process.kill(pid, "SIGHUP");
  process.exit();
});

cli.addCommand(commands);
