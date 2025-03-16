import { createLogger } from "core-kit/services/logger";
import { MongoClient } from "mongodb";
import { MONGO_URL } from "../consts/core";

const logger = createLogger("mongo");

const mongo = new MongoClient(MONGO_URL);
const db = mongo.db("piper");

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
  buckets: db.collection<Object & { _id: string }>("buckets"),
  assets: db.collection<Object & { _id: string }>("assets"),
  batches: db.collection<Object & { _id: string }>("batches"),
  nodes: db.collection<Object & { _id: string }>("nodes"),
  nodePackages: db.collection<Object & { _id: string }>("nodePackages"),
};
