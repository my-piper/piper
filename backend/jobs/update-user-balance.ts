import mongo from "app/mongo";
import { toPlain } from "core-kit/utils/models";
import { toModels } from "utils/http";
import clickhouse from "../app/clickhouse";
import io from "../app/io";
import { queues } from "../app/queue";
import { createLogger } from "../logger";
import { BalanceUpdatedEvent } from "../models/events";
import { User, UserBalance } from "../models/user";

queues.users.updateBalance.process(async ({ user }) => {
  const logger = createLogger("update-user-balance", {
    user,
  });

  const [balance] = toModels(
    await (
      await clickhouse.query({
        query: `with
    (select sum(amount) from user_balance_refills where user = {user: String}) as available,
    (select sum(costs) from pipeline_usages where launchedBy = {user: String}) as used
select 
    available, used, (available - used) as remaining`,
        format: "JSONEachRow",
        query_params: { user },
      })
    ).json(),
    UserBalance
  );
  await mongo.users.updateOne(
    { _id: user },
    {
      $set: toPlain(new User({ balance })),
    }
  );
  logger.info("User balance has been updated");

  io.to(user).emit(
    "user_balance_updated",
    toPlain(new BalanceUpdatedEvent({ user }))
  );
});
