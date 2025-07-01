import cli, { Command } from "app/cli";
import mongo from "app/mongo";
import { createLogger } from "core-kit/packages/logger";
import { toInstance } from "core-kit/packages/transform";
import { NotFoundError } from "core-kit/types/errors";
import { User } from "models/user";
import { importPipeline } from "packages/pipelines";

const logger = createLogger("pipelines");

const commands = new Command("pipelines");

commands
  .command("import <user> <url>")
  .action(async (forUser: string, url: string) => {
    logger.info(`Importing pipeline ${url}`);
    const user = await mongo.users.findOne(
      { _id: forUser },
      {
        projection: {
          _id: 1,
          name: 1,
        },
      }
    );
    if (!user) {
      throw new NotFoundError("User not found");
    }

    await importPipeline(toInstance(user, User), url);
    logger.info("✅ Done");
    process.exit();
  });

cli.addCommand(commands);
