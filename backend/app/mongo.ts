import { createLogger } from "core-kit/packages/logger";
import { MongoClient } from "mongodb";
import { MONGO_DB, MONGO_URL } from "../consts/core";

const logger = createLogger("mongo");

const mongo = new MongoClient(MONGO_URL);
const db = mongo.db(MONGO_DB);

logger.debug("Connect to mongo");
mongo.connect();

export default {
  users: db.collection<Object & { _id: string }>("users"),
  launches: db.collection<Object & { _id: string }>("launches"),
  launchOutputs: db.collection<Object & { _id: string }>("launchOutputs"),
  projects: db.collection<Object & { _id: string }>("projects"),
  projectCategories: db.collection<Object & { _id: string }>(
    "projectCategories"
  ),
  projectTags: db.collection<Object & { _id: string }>("projectTags"),
  projectComments: db.collection<Object & { _id: string }>("projectComments"),
  buckets: db.collection<Object & { _id: string }>("buckets"),
  assets: db.collection<Object & { _id: string }>("assets"),
  batches: db.collection<Object & { _id: string }>("batches"),
  nodes: db.collection<Object & { _id: string }>("nodes"),
  nodePackages: db.collection<Object & { _id: string }>("nodePackages"),
};
