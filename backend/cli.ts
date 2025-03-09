import { Command } from "commander";
import { writeFile } from "fs/promises";
import { ulid } from "ulid";
import mongo from "./app/mongo";
import { queues } from "./app/queue";
import { loadPipelines } from "./cli/load-pipelines/logic";
import * as packages from "./logic/node-packages";
import { addUser } from "./logic/users/add-user";
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

commander.command("compile-schemas").action(async () => {
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

commander.command("obliterate").action(async () => {
  console.log("Obliterate all queues!");
  await queues.nodes.obliterate();
  console.log("Done 😮");
  process.exit();
});

commander.command("created-indexes").action(async () => {
  console.log("Create indexes in mongo");
  await mongo.users.createIndexes([{ key: { email: 1 }, unique: true }]);
  console.log("Done 😮");
  process.exit();
});

commander
  .command("refill-balance")
  .option("--user <user>", "User")
  .option("--amount <amount>", "Amount", parseInt, 0)
  .action(async ({ user, amount }: { user: string; amount: number }) => {
    console.log(`Refill balance for ${user} ${amount}`);
    await refillBalance(user, amount);
    console.log("Done 😮");
    process.exit();
  });

commander
  .command("add-user")
  .option("--id <id>")
  .option("--email <email>")
  .option("--role <role>")
  .option("--password <password>")
  .action(
    async ({
      id: _id,
      email,
      password,
      role,
    }: {
      id: string;
      email: string;
      password: string;
      role: UserRole;
    }) => {
      console.log(`Add user ${_id}`);
      await addUser({ _id, email, password, roles: [role] });
      console.log("Done");
      process.exit();
    }
  );

commander.command("plan-check-packages-updates").action(async () => {
  await packages.planCheckUpdates();
  process.exit();
});

commander.command("plan-update-packages").action(async () => {
  await packages.planUpdatePackages();
  process.exit();
});

commander
  .command("check-package-updates")
  .option("--id <id>")
  .action(async ({ id }: { id: string }) => {
    await packages.checkUpdates(id);
    process.exit();
  });

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

commander.command("load-pipelines").action(async () => {
  await loadPipelines();
  process.exit();
});

commander.parse(process.argv);
