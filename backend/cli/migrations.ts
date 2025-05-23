import cli, { Command } from "app/cli";
import { exec } from "child_process";
import {
  CLICKHOUSE_DB,
  CLICKHOUSE_NATIVE_URL,
  CLICKHOUSE_PASSWORD,
  CLICKHOUSE_USER,
  MONGO_DB,
  MONGO_URL,
} from "consts/core";
import "core-kit/env";
import { createLogger } from "core-kit/packages/logger";
import qs from "qs";
import { promisify } from "util";
const run = promisify(exec);

const logger = createLogger("migration");

async function runInShell(cmd: string[]) {
  try {
    const { stdout, stderr } = await run(cmd.join(" "));
    const err = stderr?.trim();
    if (!!err) {
      logger.info(err);
    }

    const out = stdout?.trim();
    if (!!out) {
      logger.info(out);
    }
  } catch (error: any) {
    logger.error(error);
    process.exit(1);
  }
}

export const migrations = new Command("migrations");

{
  const commands = migrations.command("clickhouse");

  commands.command("apply").action(async () => {
    logger.info(
      `Apply ClickHouse migrations to ${CLICKHOUSE_NATIVE_URL}/${CLICKHOUSE_DB}]`
    );

    const connection = qs.stringify({
      database: CLICKHOUSE_DB,
      "x-multi-statement": true,
      "x-migrations-table-engine": "MergeTree",
      ...(CLICKHOUSE_USER && { username: CLICKHOUSE_USER }),
      ...(CLICKHOUSE_PASSWORD && { password: CLICKHOUSE_PASSWORD }),
    });
    const database = `clickhouse://${CLICKHOUSE_NATIVE_URL}?${connection}`;

    await runInShell([
      "migrate",
      "-path=../migrations/clickhouse",
      `-database="${database}"`,
      "up",
    ]);
    logger.info("✅ Done");
    process.exit();
  });

  commands.command("add <name>").action(async (name: string) => {
    logger.info("Add Clickhouse migration");

    await runInShell([
      "migrate",
      "create",
      "-ext=sql",
      "-dir=../migrations/clickhouse",
      "-seq",
      name,
    ]);
    logger.info("✅ Done");
    process.exit();
  });
}

{
  const commands = migrations.command("mongo");

  commands.command("apply").action(async () => {
    logger.info(`Apply Mongo migrations to ${MONGO_URL}/${MONGO_DB}]`);

    await runInShell([
      "migrate",
      "-path=../migrations/mongo",
      `-database=${MONGO_URL}/${MONGO_DB}`,
      "up",
    ]);
    logger.info("✅ Done");
    process.exit();
  });

  commands.command("add <name>").action(async (name: string) => {
    logger.info("Add Mongo migration");

    await runInShell([
      "migrate",
      "create",
      "-ext=json",
      "-dir=../migrations/mongo",
      "-seq",
      name,
    ]);
    logger.info("✅ Done");
    process.exit();
  });
}

cli.addCommand(migrations);
