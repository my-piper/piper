import { Launch } from "src/models/launch";

/** How a Launch was started: from the canvas, through a Deploy's API, or by a Deploy Node. */
export type LaunchSource = "ui" | "api" | "child";

/**
 * The Launch stores no source, so it is read from what each start path leaves
 * behind: a Child Launch has a parent, a Deploy call sets a run scope and an
 * "API call" comment, everything else came from the canvas.
 */
export function launchSource(
  launch: Partial<Pick<Launch, "parent" | "scope" | "comment">>,
): LaunchSource {
  if (launch.parent) {
    return "child";
  }
  if (launch.scope || launch.comment?.startsWith("API call")) {
    return "api";
  }
  return "ui";
}
