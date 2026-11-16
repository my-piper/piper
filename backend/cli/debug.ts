import cli, { Command } from "app/cli";
import { readFile } from "fs/promises";

const commands = new Command("debug");

commands.command("server").action(async (_name: string) => {
  const pid = parseInt(await readFile("server.pid", "utf8"));
  process.kill(pid, "SIGHUP");
  process.exit();
});

cli.addCommand(commands);
