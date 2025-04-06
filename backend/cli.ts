import "core-kit/env";
import "reflect-metadata";

import { Command } from "commander";
import { RELOAD_WORKER_CHANNEL } from "consts/signals";
import redis from "core-kit/services/redis";
import { toPlain } from "core-kit/utils/models";
import { writeFile } from "fs/promises";
import { ulid } from "ulid";
import mongo from "./app/mongo";
import * as environment from "./cli/environment";
import { loadPipelines } from "./cli/load-pipelines/logic";
import * as modules from "./logic/modules";
import * as packages from "./logic/node-packages";
import { add } from "./logic/users/add-user";
import { refillBalance } from "./logic/users/refill-balance";
import { UserRole } from "./models/user";
import NODE_PACKAGE_SCHEMA from "./schemas/node-package.json" with { type: "json" };
import NODE_SCHEMA from "./schemas/node.json" with { type: "json" };
import PIPELINE_SCHEMA from "./schemas/pipeline.json" with { type: "json" };
import PROJECT_SCHEMA from "./schemas/project.json" with { type: "json" };
import USER_SCHEMA from "./schemas/user.json" with { type: "json" };
import { loadSchema } from "./utils/schema";

const commander = new Command();

commander.version("1.0.0").description("Piper CLI");

{
  const commands = new Command("schemas");

  commands.command("compile").action(async () => {
    console.log("Compile schemas");
    const [nodePackage, node, pipeline, user, project] = [
      await loadSchema(NODE_PACKAGE_SCHEMA),
      await loadSchema(NODE_SCHEMA),
      await loadSchema(PIPELINE_SCHEMA),
      await loadSchema(USER_SCHEMA),
      await loadSchema(PROJECT_SCHEMA),
    ];

    await writeFile(
      "schemas/compiled.json",
      JSON.stringify({ nodePackage, node, pipeline, user, project }, null, "\t")
    );

    process.exit();
  });

  commander.addCommand(commands);
}

{
  const commands = new Command("mongo");

  commands.command("create").action(async () => {
    console.log("Create indexes in mongo");
    try {
      await mongo.users.createIndexes([{ key: { email: 1 }, unique: true }]);
      await mongo.projects.createIndex(
        { slug: 1 },
        { unique: true, partialFilterExpression: { slug: { $exists: true } } }
      );
    } catch (e) {
      if (e.code === 11000) {
        // skip
      } else {
        throw e;
      }
    }

    console.log("Done 😮");
    process.exit();
  });

  commands.command("state").action(async () => {
    console.log("Indexes in mongo");
    console.log(await mongo.users.indexes());
    console.log(await mongo.projects.indexes());

    console.log("Done 😮");
    process.exit();
  });

  commander.addCommand(commands);
}

{
  const commands = new Command("users");

  commands
    .command("add <id> <email> <password> <role>")
    .action(
      async (id: string, email: string, password: string, role: UserRole) => {
        console.log(`Add user ${id}`);
        await add({ _id: id, email, password, roles: [role] });
        console.log("Done");
        process.exit();
      }
    );

  commands
    .command("refill <user> <amount>")
    .action(async (user: string, amount: number) => {
      console.log(`Refill balance for ${user} ${amount}`);
      await refillBalance(user, amount, {
        url: "https://en.wikipedia.org/wiki/Command-line_interface",
      });
      console.log("Done 😮");
      process.exit();
    });

  commander.addCommand(commands);
}

{
  const commands = new Command("packages");

  commands.command("check-updates <id>").action(async (id: string) => {
    await packages.checkUpdates(id);
    process.exit();
  });

  commands.command("plan-check-updates").action(async () => {
    await packages.planCheckUpdates();
    process.exit();
  });

  commands.command("plan-update").action(async () => {
    await packages.planUpdatePackages();
    process.exit();
  });

  commander.addCommand(commands);
}

{
  const commands = new Command("env").action(async () => {
    console.log(toPlain(await environment.get()));
    process.exit();
  });

  commands
    .command("set <name> <value>")
    .action(async (name: string, value: string) => {
      console.log(`Set variable ${name} ${value}`);
      await environment.set(name, value);
      process.exit();
    });

  commands.command("remove <name>").action(async (name: string) => {
    console.log(`Remove variable ${name}`);
    await environment.remove(name);
    process.exit();
  });

  commander.addCommand(commands);
}

{
  const commands = new Command("modules").action(async () => {
    console.log(toPlain(await modules.list()));
    process.exit();
  });

  commands.command("remove <name>").action(async (name: string) => {
    console.log(`Remove ${name}`);
    await modules.remove(name);
    process.exit();
  });

  commands
    .command("add <name> <version>")
    .action(async (name: string, version: string) => {
      console.log(`Install ${name} ${version}`);
      await modules.add(name, version);
      process.exit();
    });

  commands.command("update").action(async ({ name }: { name: string }) => {
    console.log("Update modules");
    await modules.update();
    process.exit();
  });

  commander.addCommand(commands);
}

{
  const commands = new Command("workers");

  commands.command("reboot").action(async (name: string) => {
    console.log("Rebooting workers...");
    await redis.publish(RELOAD_WORKER_CHANNEL, new Date().toISOString());
    process.exit();
  });

  commander.addCommand(commands);
}

// TODO: remove soon
commander
  .command("cursors")
  .option("--id <id>")
  .action(async () => {
    const projects = await mongo.projects.find().toArray();
    for (const { _id } of projects) {
      console.log(_id);
      await mongo.projects.updateOne({ _id }, { $set: { cursor: ulid() } });
    }
    const nodePackages = await mongo.nodePackages.find().toArray();
    for (const { _id } of nodePackages) {
      console.log(_id);
      await mongo.nodePackages.updateOne({ _id }, { $set: { cursor: ulid() } });
    }
    const users = await mongo.users.find().toArray();
    for (const { _id } of users) {
      console.log(_id);
      await mongo.users.updateOne({ _id }, { $set: { cursor: ulid() } });
    }
    process.exit();
  });

{
  const commands = new Command("pipelines");

  commands.command("load").action(async () => {
    await loadPipelines();
    process.exit();
  });

  commander.addCommand(commands);
}

commander.parse(process.argv);
