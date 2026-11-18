import cli, { Command } from "app/cli";
import { createLogger } from "core-kit/packages/logger";
import { UserRole } from "models/user";
import { add } from "packages/users/add-user";

const logger = createLogger("users");

const commands = new Command("users");

commands
  .command("add <id> <email> <password> <role>")
  .action(
    async (id: string, email: string, password: string, role: UserRole) => {
      console.log(`Add user ${id}`);
      await add({ _id: id, email, password, roles: [role] });
      logger.info("✅ Done");
      process.exit();
    }
  );

cli.addCommand(commands);
