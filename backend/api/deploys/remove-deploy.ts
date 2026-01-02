import api from "app/api";
import mongo from "app/mongo";
import { DEPLOY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { checkAdmin, checkLogged, handle } from "utils/http";

const remove = handle(
  ({ currentUser }) =>
    async ({ params: { slug, prefix } }) => {
      checkLogged(currentUser);

      if (!prefix) {
        checkAdmin(currentUser);
      }

      await redis.del(DEPLOY(slug, prefix));
      const _id = [...(!!prefix ? [prefix] : []), slug].join("_");
      await mongo.deploys.deleteOne({ _id });
      return null;
    }
);

api.delete("/api/deploys/:slug", remove);
api.delete("/api/deploys/:prefix/:slug", remove);
