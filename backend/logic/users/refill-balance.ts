import { toPlain } from "core-kit/utils/models";
import { ulid } from "ulid";
import clickhouse from "../../app/clickhouse";
import { queues } from "../../app/queue";
import { BalanceRefill } from "../../models/balance-refill";

export async function refillBalance(user: string, amount: number) {
  await clickhouse.insert({
    table: "user_balance_refills",
    values: [
      toPlain(
        new BalanceRefill({
          user,
          refilledAt: new Date(),
          amount,
          cursor: ulid(),
        })
      ),
    ],
    format: "JSONEachRow",
  });

  await queues.users.updateBalance.plan({ user });
}
