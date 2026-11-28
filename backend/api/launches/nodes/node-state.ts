import api from "app/api";
import { liveState } from "packages/launches/live-state";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";

api.get(
  "/api/launches/:launch/nodes/:node/state",
  handle(({ currentUser }) => async ({ params: { launch, node } }) => {
    await checkLaunchVisible(currentUser, launch);

    // sent as the stored JSON text, as before
    const data = await liveState.state(launch, node);
    return data ? JSON.stringify(data) : null;
  })
);
