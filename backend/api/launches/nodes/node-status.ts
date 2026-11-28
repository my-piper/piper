import api from "app/api";
import { liveState } from "packages/launches/live-state";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/:node/status",
  handle(({ currentUser }) => async ({ params: { launch, node } }) => {
    await checkLaunchVisible(currentUser, launch);

    // sent as the stored JSON text, as before
    const data = await liveState.status(launch, node);
    return data ? JSON.stringify(data) : null;
  })
);
