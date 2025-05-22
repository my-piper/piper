import "reflect-metadata";

import { exec } from "child_process";
import { Command } from "commander";
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

const logger = createLogger("migration");

export const migrationCommands = new Command("migrations");

const clickhouseMigrations = migrationCommands.command("clickhouse");

clickhouseMigrations.command("apply").action(async () => {
  logger.info("Running Clickhouse migrations");

  const databaseParams = [
    `database=${CLICKHOUSE_DB}`,
    "x-multi-statement=true",
    "x-migrations-table-engine=MergeTree",
  ];

  if (CLICKHOUSE_USER) {
    databaseParams.push(`username=${CLICKHOUSE_USER}`);
  }

  if (CLICKHOUSE_PASSWORD) {
    databaseParams.push(`password=${CLICKHOUSE_PASSWORD}`);
  }

  const execCommand = [
    "migrate",
    "-path=../migrations/clickhouse",
    `-database="clickhouse://${CLICKHOUSE_NATIVE_URL}?${databaseParams.join("&")}"`,
    "up",
  ];

  exec(execCommand.join(" "), (error: any, stdout: string, stderr: string) => {
    if (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
    if (stderr) {
      logger.info(stderr?.trim());
    }
    logger.info(stdout?.trim());
    logger.info("Clickhouse migrations applied successfully");

    process.exit();
  });
});

clickhouseMigrations.command("add <name>").action(async (name: string) => {
  logger.info("Add Clickhouse migration");

  const execCommand = [
    "migrate",
    "create",
    "-ext=sql",
    "-dir=../migrations/clickhouse",
    "-seq",
    name,
  ];

  exec(execCommand.join(" "), (error: any, stdout: string, stderr: string) => {
    if (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
    if (stderr) {
      logger.info(stderr?.trim());
    }

    logger.info(stdout?.trim());
    logger.info("Clickhouse migration added successfully");

    process.exit();
  });
});

const mongoMigrations = migrationCommands.command("mongo");

mongoMigrations.command("apply").action(async () => {
  logger.info("Running Mongo migrations");

  const execCommand = [
    "migrate",
    "-path=../migrations/mongo",
    `-database=${MONGO_URL}/${MONGO_DB}`,
    "up",
  ];

  exec(execCommand.join(" "), (error: any, stdout: string, stderr: string) => {
    if (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
    if (stderr) {
      logger.info(stderr?.trim());
    }
    logger.info(stdout?.trim());
    logger.info("Mongo migrations applied successfully");

    process.exit();
  });
});

mongoMigrations.command("add <name>").action(async (name: string) => {
  logger.info("Add Mongo migration");

  const execCommand = [
    "migrate",
    "create",
    "-ext=json",
    "-dir=../migrations/mongo",
    "-seq",
    name,
  ];

  exec(execCommand.join(" "), (error: any, stdout: string, stderr: string) => {
    if (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
    if (stderr) {
      logger.info(stderr?.trim());
    }

    logger.info(stdout?.trim());
    logger.info("Mongo migration added successfully");

    process.exit();
  });
});
