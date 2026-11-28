import api from "app/api";
import { DataError } from "core-kit/types/errors";
import { liveState } from "packages/launches/live-state";
import { handle } from "utils/http";
import { checkLaunchVisible } from "packages/launches/access";
import { getNodeInputs } from "utils/node";

api.get(
  "/api/launches/:launch/:node/inputs",
  handle(({ currentUser }) => async ({ params }) => {
    await checkLaunchVisible(currentUser, params.launch);

    const launch = await liveState.get(params.launch);
    if (!launch) {
      throw new DataError("Launch is not found");
    }

    const { pipeline } = launch;

    const node = pipeline.nodes.get(params.node);
    if (!node) {
      throw new DataError("Node is not found in pipeline");
    }

    return await getNodeInputs({ launch, node })(params.node);
  })
);
