import api from "app/api";
import { toPlain } from "core-kit/packages/transform";
import { readLaunchLogs } from "packages/nodes/node-logs";
import { handle } from "utils/http";
import { checkLaunchVisible } from "./access";

api.get(
  "/api/launches/:launch/logs",
  handle(({ currentUser }) => async ({ params: { launch }, query }) => {
    await checkLaunchVisible(currentUser, launch);

    const node = typeof query["node"] === "string" ? query["node"] : undefined;
    return toPlain(await readLaunchLogs(launch, node));
  })
);
