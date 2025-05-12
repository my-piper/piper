import api from "app/api";
import { toInstance, validate } from "core-kit/packages/transform";
import sql from "sql-bricks-sqlite";
import { checkLogged, handle } from "utils/http";
import clickhouse from "../../app/clickhouse";
import { BalanceRefillsFilter } from "./models";

const PAGE_LIMIT = 20;

api.get(
  "/api/balance-refills",
  handle(({ currentUser }) => async ({ query }) => {
    checkLogged(currentUser);

    const filter = toInstance(query, BalanceRefillsFilter);
    await validate(filter);

    const { cursor } = filter;

    return await (
      await clickhouse.query({
        query: (() => {
          let query = sql
            .select()
            .from("user_balance_refills")
            .where({ user: currentUser._id })
            .orderBy("cursor desc")
            .limit(PAGE_LIMIT);
          if (!!cursor) {
            query = query.where(sql.lt("cursor", cursor));
          }
          return query.toString();
        })(),
        format: "JSONEachRow",
      })
    ).json();
  })
);
