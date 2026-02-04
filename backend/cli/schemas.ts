import cli, { Command } from "app/cli";
import { createLogger } from "core-kit/packages/logger";
import { writeFile } from "fs/promises";
import FLOW_SCHEMA from "schemas/flow.json" with { type: "json" };
import LAUNCH_REQUEST_SCHEMA from "schemas/launch-request.json" with { type: "json" };
import NODE_PACKAGE_SCHEMA from "schemas/node-package.json" with { type: "json" };
import NODE_SCHEMA from "schemas/node.json" with { type: "json" };
import PIPELINE_SCHEMA from "schemas/pipeline.json" with { type: "json" };
import PROJECT_SCHEMA from "schemas/project.json" with { type: "json" };
import USER_SCHEMA from "schemas/user.json" with { type: "json" };
import { loadSchema } from "utils/schema";

const logger = createLogger("pipelines");

const commands = new Command("schemas");

commands.command("compile").action(async () => {
  logger.info("Compile schemas");
  const [nodePackage, node, pipeline, user, project, launchRequest, flow] = [
    await loadSchema(NODE_PACKAGE_SCHEMA),
    await loadSchema(NODE_SCHEMA),
    await loadSchema(PIPELINE_SCHEMA),
    await loadSchema(USER_SCHEMA),
    await loadSchema(PROJECT_SCHEMA),
    await loadSchema(LAUNCH_REQUEST_SCHEMA),
    await loadSchema(FLOW_SCHEMA),
  ];

  await writeFile(
    "schemas/compiled.json",
    JSON.stringify(
      { nodePackage, node, pipeline, user, project, launchRequest, flow },
      null,
      "\t"
    )
  );

  logger.info("✅ Done");
  process.exit();
});

cli.addCommand(commands);
