import cli, { Command } from "app/cli";
import { createLogger } from "core-kit/packages/logger";
import { UserRole } from "models/user";
import { add } from "packages/users/add-user";
import { refillBalance } from "packages/users/refill-balance";

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

commands
  .command("refill <user> <amount>")
  .action(async (user: string, amount: number) => {
    console.log(`Refill balance for ${user} ${amount}`);
    await refillBalance(user, amount, {
      url: "https://en.wikipedia.org/wiki/Command-line_interface",
    });
    logger.info("✅ Done");
    process.exit();
  });

cli.addCommand(commands);
