import mongo from "app/mongo";
import { toInstance } from "core-kit/packages/transform";
import { NotFoundError } from "core-kit/types/errors";
import { importPipeline } from "logic/pipelines";
import { User } from "models/user";

export async function _import(forUser: string, url: string) {
  const user = await mongo.users.findOne(
    { _id: forUser },
    {
      projection: {
        _id: 1,
        name: 1,
      },
    }
  );
  if (!user) {
    throw new NotFoundError("User not found");
  }

  await importPipeline(toInstance(user, User), url);
}
