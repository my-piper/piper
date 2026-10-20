/**
 * Plain wire payloads for launch results, shared like `plain.ts` (no Angular,
 * Jasmine or `src/...` imports).
 *
 * Sources (backend):
 * - POST /api/projects/:_id/launch returns the launch without `pipeline`
 *   (backend/api/projects/launch-project.ts).
 * - POST /api/launches/:id/interrupt returns null; 404 when the launch expired
 *   (backend/api/launches/interrupt-launch.ts).
 * - GET /api/launches/:launch/:node/{inputs,outputs,status,progress} and
 *   /api/launches/:launch/nodes/:node/{state,logs,jobs}
 *   (backend/api/launches/nodes/*).
 * - GET /api/projects/:project/deploys, POST /api/projects/:_id/deploy (null),
 *   DELETE /api/deploys/:prefix/:slug or /api/deploys/:slug (null)
 *   (backend/api/projects/deploys/list.ts, backend/api/projects/deploy-project.ts,
 *   backend/api/deploys/remove-deploy.ts).
 */
import { launchPlain, LAUNCH_ID, Plain, PROJECT_A_ID } from "./plain";

/** Launch response of POST /api/projects/:_id/launch. */
export function launchResponsePlain(
  _id = LAUNCH_ID,
  projectId = PROJECT_A_ID,
): Plain {
  const launch: Plain = { ...launchPlain(projectId), _id };
  delete launch["pipeline"];
  return launch;
}

/** 1×1 transparent PNG; never leaves the browser. */
export const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Launch with one finished output of every rendered artefact type. */
export function launchWithOutputsPlain(): Plain {
  return {
    ...launchPlain(),
    outputs: {
      a_text: {
        _id: "a_text",
        title: "Text",
        type: "string",
        data: { type: "string", value: "Hello", length: 5 },
      },
      b_json: {
        _id: "b_json",
        title: "Json",
        type: "json",
        data: { type: "json", value: { answer: 42 } },
      },
      c_flag: {
        _id: "c_flag",
        title: "Flag",
        type: "boolean",
        data: { type: "boolean", value: false },
      },
      d_score: {
        _id: "d_score",
        title: "Score",
        type: "float",
        data: { type: "float", value: 0.25 },
      },
      e_image: {
        _id: "e_image",
        title: "Image",
        type: "image",
        data: {
          type: "image",
          format: "png",
          url: PIXEL,
          width: 1,
          height: 1,
        },
      },
      f_images: {
        _id: "f_images",
        title: "Images",
        type: "image[]",
        data: {
          type: "image[]",
          count: 2,
          images: [
            { format: "png", url: `${PIXEL}#0`, width: 1, height: 1 },
            { format: "png", url: `${PIXEL}#1`, width: 1, height: 1 },
          ],
        },
      },
    },
  };
}

export function nodeStatusPlain(
  state: "running" | "done" | "error",
  error?: string,
): Plain {
  return {
    state,
    ...(error ? { error } : {}),
  };
}

export function deploysPlain(): Plain[] {
  return [
    {
      _id: "user_owner_small-graph-v1",
      prefix: "user_owner",
      slug: "small-graph-v1",
      deployedAt: "2026-03-02T10:00:00.000Z",
    },
    {
      _id: "global-graph",
      slug: "global-graph",
      deployedAt: "2026-03-01T10:00:00.000Z",
    },
  ];
}
