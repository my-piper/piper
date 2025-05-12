import clickhouse from "app/clickhouse";
import mongo from "app/mongo";
import { queues } from "app/queues";
import { notify } from "core-kit/packages/io";
import { createLogger } from "core-kit/packages/logger";
import { toPlain } from "core-kit/packages/transform";
import { User, UserBalance } from "models/user";
import { toModels } from "utils/http";

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
  notify(user, "user_balance_updated");
});
