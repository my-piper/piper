import clickhouse from "app/clickhouse";
import { queues } from "app/queues";
import { toPlain } from "core-kit/packages/transform";
import { BalanceRefill } from "models/balance-refill";
import { ulid } from "ulid";

export async function refillBalance(
  user: string,
  amount: number,
  { url }: { url?: string } = {}
) {
  await clickhouse.insert({
    table: "user_balance_refills",
    values: [
      toPlain(
        new BalanceRefill({
          user,
          refilledAt: new Date(),
          amount,
          url,
          cursor: ulid(),
        })
      ),
    ],
    format: "JSONEachRow",
  });

  await queues.users.updateBalance.plan({ user });
}
