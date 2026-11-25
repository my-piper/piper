import cli, { Command } from "app/cli";
import mongo from "app/mongo";
import { createLogger } from "core-kit/packages/logger";
import { toInstance } from "core-kit/packages/transform";
import { NotFoundError } from "core-kit/types/errors";
import { User } from "models/user";
import { REGISTRY_URL } from "consts/registry";
import { importPipeline } from "packages/pipelines";
import { nodesWithRegistryImports } from "packages/registry/registry-imports";

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

// Edited package scripts saved before registry imports were host-free carry
// this environment's registry URL; rewrite them to `registry:` references.
commands
  .command("registry-imports")
  .description(
    "Rewrite registry URLs in edited node scripts of projects and deploys to registry: references (launch history is left as it ran)"
  )
  .option(
    "--host <url...>",
    "other registry hosts the scripts may carry",
    [] as string[]
  )
  .option("--apply", "write the changes; without it, only report them")
  .action(async ({ host, apply }: { host: string[]; apply?: boolean }) => {
    const hosts = [REGISTRY_URL, ...host];
    logger.info(`Registry hosts: ${hosts.join(", ")}`);
    for (const [name, collection] of [
      ["projects", mongo.projects],
      ["deploys", mongo.deploys],
    ] as const) {
      const cursor = collection.find(
        {},
        { projection: { "pipeline.nodes": 1 } }
      );
      for await (const document of cursor) {
        const { pipeline } = document as {
          pipeline?: { nodes?: Record<string, { script?: string }> };
        };
        const changed = nodesWithRegistryImports(pipeline?.nodes, hosts);
        const keys = Object.keys(changed);
        if (keys.length === 0) continue;
        logger.info(`${name} ${document._id}: ${keys.join(", ")}`);
        if (apply) {
          await collection.updateOne(
            { _id: document._id },
            {
              $set: Object.fromEntries(
                keys.map((key) => [
                  `pipeline.nodes.${key}.script`,
                  changed[key],
                ])
              ),
            }
          );
        }
      }
    }
    logger.info(apply ? "✅ Done" : "Dry run: pass --apply to write");
    process.exit();
  });

cli.addCommand(commands);
