import api from "app/api";
import mongo from "app/mongo";
import { checkAdmin, handle } from "utils/http";

api.get(
  "/api/node-packages",
  handle(({ currentUser }) => async () => {
    checkAdmin(currentUser);
    const [packages, counts] = await Promise.all([
      mongo.nodePackages.find({}).toArray(),
      mongo.nodes
        .aggregate<{
          _id: string;
          count: number;
        }>([{ $group: { _id: "$package", count: { $sum: 1 } } }])
        .toArray(),
    ]);
    const nodeCounts = new Map(counts.map(({ _id, count }) => [_id, count]));

    return packages.map((nodePackage) => ({
      ...nodePackage,
      nodeCount: nodeCounts.get(nodePackage._id) ?? 0,
    }));
  })
);
