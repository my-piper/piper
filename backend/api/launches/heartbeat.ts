import api from "app/api";
import { liveState } from "packages/launches/live-state";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:_id/heartbeat",
  handle(({ currentUser }) => async ({ params: { _id } }) => {
    await checkLaunchVisible(currentUser, _id);

    return await liveState.heartbeat(_id);
  })
);
