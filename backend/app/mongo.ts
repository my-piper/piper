import { createLogger } from "core-kit/packages/logger";
import { MongoClient } from "mongodb";
import { MONGO_DB, MONGO_URL } from "../consts/core";

const logger = createLogger("mongo");

export const mongo = new MongoClient(MONGO_URL);
const db = mongo.db(MONGO_DB);

logger.debug("Connect to mongo");
mongo.connect();

export default {
  users: db.collection<object & { _id: string }>("users"),
  launches: db.collection<object & { _id: string }>("launches"),
  launchArtefacts: db.collection<object & { _id: string }>("launchArtefacts"),
  projects: db.collection<object & { _id: string }>("projects"),
  deploys: db.collection<object & { _id: string }>("deploys"),
  projectCategories: db.collection<object & { _id: string }>(
    "projectCategories"
  ),
  projectTags: db.collection<object & { _id: string }>("projectTags"),
  projectComments: db.collection<object & { _id: string }>("projectComments"),
  buckets: db.collection<object & { _id: string }>("buckets"),
  assets: db.collection<object & { _id: string }>("assets"),
  batches: db.collection<object & { _id: string }>("batches"),
  nodes: db.collection<object & { _id: string }>("nodes"),
  nodePackages: db.collection<object & { _id: string }>("nodePackages"),
  chatMessages: db.collection<object & { _id: string }>("chatMessages"),
};
