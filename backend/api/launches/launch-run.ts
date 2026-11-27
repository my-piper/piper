import api from "app/api";
import clickhouse from "core-kit/packages/clickhouse";
import { toPlain } from "core-kit/packages/transform";
import { addYears } from "date-fns";
import { Response } from "express";
import { LaunchRun } from "models/launch-run";
import { checkLaunchVisible } from "packages/launches/access";
import { handle, toModels } from "utils/http";

// The recorded outcome of a finished launch (one row per launch, written by
// recordLaunchRun), or null while it is unfinished or after the row expired.
api.get(
  "/api/launches/:launch/run",
  handle(
    ({ currentUser }) =>
      async ({ params: { launch } }, resp: Response) => {
        await checkLaunchVisible(currentUser, launch);

        const [run] = toModels(
          await (
            await clickhouse.query({
              query: `select * from launch_runs where launch = {launch: String} limit 1`,
              format: "JSONEachRow",
              query_params: { launch },
            })
          ).json(),
          LaunchRun
        );

        if (!run) {
          return null;
        }
        // Sent here: a returned answer gets handle()'s no-cache headers, and a
        // recorded run never changes.
        resp
          .set({
            // Private: the answer depends on who asks (checkLaunchVisible).
            "Cache-Control": "private, max-age=31536000, immutable",
            Expires: addYears(new Date(), 1).toUTCString(),
          })
          .send(toPlain(run));
      }
  )
);
