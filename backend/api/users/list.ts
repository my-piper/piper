import api from "app/api";
import mongo from "app/mongo";
import { toInstance, validate } from "core-kit/packages/transform";
import { checkAdmin, handle } from "utils/http";
import { UsersFilter } from "./models/users-filter";

api.get(
  "/api/users",
  handle(({ currentUser }) => async ({ query }) => {
    checkAdmin(currentUser);

    const filter = toInstance(query, UsersFilter);
    await validate(filter);

    const { search, cursor } = filter;

    return await mongo.users
      .find(
        {
          ...(!!search
            ? {
                email: { $regex: new RegExp(search, "i") },
              }
            : {}),
          ...(!!cursor ? { cursor: { $lt: cursor } } : {}),
        },
        {
          projection: {
            createdAt: 1,
            name: 1,
            email: 1,
            provider: 1,
            balance: 1,
            roles: 1,
            cursor: 1,
          },
        }
      )
      .sort({ cursor: -1 })
      .limit(30)
      .toArray();
  })
);
