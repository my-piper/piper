/**
 * Plain wire fixtures shared by the fast suites and the browser suite.
 *
 * Every export is a factory returning a fresh, independent object: mutate the
 * result freely. This module must stay free of Angular, Jasmine and `src/...`
 * imports so Playwright (Node) can load it too.
 *
 * Wire sources (backend):
 * - project/pipeline shapes: backend/schemas/pipeline.json, backend/models/project.ts
 * - patch: backend/api/projects/patch-project.ts (PATCH /api/projects/:_id/patch/:revision)
 * - errors: backend/utils/http.ts `handle` (DataError → 400, text body when no details)
 * - artefact data: backend/models/launch.ts (`data.type` is the class-transformer discriminator)
 * - node events: backend/jobs/process-node/process-node-handler.ts `notifyNode`
 * - launch events: backend/jobs/set-launch-output.ts, set-launch-inputs.ts, set-launch-errors.ts
 * - rooms: backend/sockets.ts (`join_room` / `leave_room` carry the room name)
 */

export type Plain = Record<string, unknown>;

export const PROJECT_A_ID = "project_aaaa";
export const PROJECT_B_ID = "project_bbbb";

export const USER_IDS = {
  owner: "user_owner",
  engineer: "user_engineer",
  admin: "user_admin",
  stranger: "user_stranger",
} as const;

export type UserKind = keyof typeof USER_IDS;

export function userPlain(kind: UserKind = "owner"): Plain {
  const roles: Record<UserKind, string[]> = {
    owner: [],
    engineer: ["engineer"],
    admin: ["admin"],
    stranger: [],
  };
  return {
    _id: USER_IDS[kind],
    email: `${kind}@piper.test`,
    createdAt: "2026-01-01T00:00:00.000Z",
    roles: roles[kind],
    balance: {
      available: 10,
      used: 2,
      remaining: 8,
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  };
}

/** Response body of `POST /api/login` (backend/api/users/login.ts). */
export function authorizationPlain(kind: UserKind = "owner"): Plain {
  return { token: `fake-token-${kind}`, user: userPlain(kind) };
}

/**
 * Two nodes with scalar ports wired `pipeline input topic → node_one.prompt →
 * node_one.text → node_two.text → node_two.result → pipeline output result`.
 */
export function smallGraphPipeline(): Plain {
  return {
    name: "Small graph",
    version: 1,
    description: "Two node fixture",
    tags: ["fixture"],
    layout: { left: 0, top: 0, zoom: 1 },
    start: { nodes: ["node_one"] },
    inputs: {
      topic: {
        order: 1,
        title: "Topic",
        type: "string",
        required: true,
        arrange: { x: 20, y: 40 },
        flows: { topic_to_prompt: { to: "node_one", input: "prompt" } },
      },
    },
    outputs: {
      result: {
        order: 1,
        title: "Result",
        type: "json",
        arrange: { x: 900, y: 40 },
        flows: { result_from_two: { from: "node_two", output: "result" } },
      },
    },
    flows: {
      one_to_two: {
        from: "node_one",
        output: "text",
        to: "node_two",
        input: "text",
      },
    },
    nodes: {
      node_one: {
        _id: "node_one",
        title: "Generate text",
        version: 1,
        execution: "regular",
        arrange: { x: 200, y: 40 },
        script: "export async function run() { return {}; }",
        inputs: {
          prompt: {
            order: 1,
            title: "Prompt",
            type: "string",
            featured: true,
            required: true,
          },
          temperature: {
            order: 2,
            title: "Temperature",
            type: "float",
            default: 0.5,
          },
        },
        outputs: { text: { title: "Text", type: "string" } },
      },
      node_two: {
        _id: "node_two",
        title: "Make JSON",
        version: 1,
        execution: "rapid",
        arrange: { x: 560, y: 40 },
        script: "export async function run() { return {}; }",
        inputs: {
          text: { order: 1, title: "Text", type: "string", featured: true },
          flag: { order: 2, title: "Flag", type: "boolean", default: false },
          count: { order: 3, title: "Count", type: "integer", default: 0 },
          label: { order: 4, title: "Label", type: "string", default: "" },
        },
        outputs: {
          result: { title: "Result", type: "json" },
          images: { title: "Images", type: "image[]" },
        },
      },
    },
  };
}

type Graph = {
  flows: Record<string, Plain>;
  nodes: Record<string, { inputs: Record<string, Plain> }>;
};

/** Small graph plus a `json` transformer flow node_two.result → node_three.answer. */
export function smallGraphWithJsonTransformer(path = "data.answer"): Plain {
  const pipeline = smallGraphPipeline();
  const graph = pipeline as unknown as Graph;
  graph.nodes["node_three"] = {
    _id: "node_three",
    title: "Consume JSON",
    version: 1,
    execution: "rapid",
    arrange: { x: 900, y: 240 },
    inputs: {
      answer: { order: 1, title: "Answer", type: "string", featured: true },
      limit: { order: 2, title: "Limit", type: "integer", featured: true },
      enabled: { order: 3, title: "Enabled", type: "boolean", featured: true },
    },
    outputs: {},
  } as unknown as { inputs: Record<string, Plain> };
  graph.flows["two_to_three"] = {
    from: "node_two",
    output: "result",
    to: "node_three",
    input: "answer",
    transformer: { type: "json", path },
  };
  return pipeline;
}

/** Small graph plus an `array` transformer flow node_two.images[index] → node_four.image. */
export function smallGraphWithImageTransformer(index = 1): Plain {
  const pipeline = smallGraphPipeline();
  const graph = pipeline as unknown as Graph;
  graph.nodes["node_four"] = {
    _id: "node_four",
    title: "Consume image",
    version: 1,
    execution: "rapid",
    arrange: { x: 900, y: 440 },
    inputs: {
      image: { order: 1, title: "Image", type: "image", featured: true },
    },
    outputs: {},
  } as unknown as { inputs: Record<string, Plain> };
  graph.flows["two_to_four"] = {
    from: "node_two",
    output: "images",
    to: "node_four",
    input: "image",
    transformer: { type: "array", index },
  };
  return pipeline;
}

/**
 * Launch request with every falsy flavour kept distinct: `zero: 0`,
 * `off: false`, `empty: ""`; `absent` is deliberately missing.
 */
export function launchRequestPlain(): Plain {
  return {
    options: { bucket: "outputs" },
    inclusive: { nodes: ["node_one", "node_two"] },
    inputs: { topic: "Cats", zero: 0, off: false, empty: "" },
    nodes: {
      node_one: { inputs: { temperature: 0 } },
      node_two: {
        inputs: { flag: true, count: 3, label: "custom" },
        outputs: { result: '{"data":{"answer":"42"}}' },
      },
    },
  };
}

export function environmentPlain(): Plain {
  return { variables: { API_URL: "http://dummy.piper.test", RETRIES: 0 } };
}

function projectPlain(
  _id: string,
  title: string,
  revision: string,
  owner: UserKind,
): Plain {
  return {
    _id,
    slug: _id.replace("_", "-"),
    title,
    tags: ["fixture"],
    revision,
    visibility: "private",
    createdAt: "2026-02-01T10:00:00.000Z",
    updatedAt: "2026-02-02T10:00:00.000Z",
    createdBy: { _id: USER_IDS[owner], email: `${owner}@piper.test` },
    updatedBy: { _id: USER_IDS[owner] },
    pipeline: smallGraphPipeline(),
    launchRequest: launchRequestPlain(),
    environment: environmentPlain(),
  };
}

export function projectAPlain(): Plain {
  return projectPlain(PROJECT_A_ID, "Project A", "rev_a_1", "owner");
}

export function projectBPlain(): Plain {
  const project = projectPlain(
    PROJECT_B_ID,
    "Project B",
    "rev_b_1",
    "engineer",
  );
  (project["pipeline"] as Plain)["name"] = "Project B pipeline";
  return project;
}

export const PATCH_PROJECT_URL = (id: string, revision: string) =>
  `/api/projects/${id}/patch/${revision}`;

/**
 * Successful patch response: the backend strips `_id`, `title`, `pipeline`,
 * `launchRequest` and `environment`, returning the new `revision`.
 */
export function patchResponsePlain(
  revision: string,
  kind: UserKind = "owner",
): Plain {
  return {
    slug: "project-fixture",
    revision,
    createdBy: { _id: USER_IDS[kind] },
    updatedBy: { _id: USER_IDS[kind] },
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
}

/** Revision conflict: DataError without details → HTTP 400 with a text body. */
export function revisionConflict(serverRevision = "rev_server") {
  return {
    status: 400,
    statusText: "Bad Request",
    body: `Version on sever is more fresh version ${serverRevision}`,
  };
}

/** DataError with details → HTTP 400 with `{ message, details }`. */
export function schemaInvalid() {
  return {
    status: 400,
    statusText: "Bad Request",
    body: {
      message: "Pipeline schema invalid",
      details: ["/nodes/node_one: must have required property 'title': {}"],
    },
  };
}

export const LAUNCH_ID = "launch_one";

export function launchPlain(projectId = PROJECT_A_ID): Plain {
  return {
    _id: LAUNCH_ID,
    launchedAt: "2026-03-01T12:00:00.000Z",
    startedAt: "2026-03-01T12:00:01.000Z",
    project: { _id: projectId, title: "Project A" },
    errors: [],
    pipeline: smallGraphPipeline(),
    launchRequest: launchRequestPlain(),
    inputs: {
      topic: {
        _id: "topic",
        title: "Topic",
        type: "string",
        data: { type: "string", value: "Cats", length: 4 },
      },
    },
    outputs: {},
  };
}

/**
 * Node-level events (`node_running`, `node_done`, `node_error`, `node_flow`,
 * `node_reset`, …) are emitted to the launch room as `{ launch, node }`.
 * The backend does not include the frontend PipelineEvent `event` field.
 */
export function nodeEventPlain(node = "node_one", launch = LAUNCH_ID): Plain {
  return { launch, node };
}

/** `set_output` is emitted to the launching user's room. */
export function setOutputEventPlain(launch = LAUNCH_ID): Plain {
  return {
    launch,
    id: "result",
    output: {
      _id: "result",
      title: "Result",
      type: "json",
      data: { type: "json", value: { answer: 42 } },
    },
  };
}

export function setErrorsEventPlain(launch = LAUNCH_ID): Plain {
  return { launch, errors: ["node_two: failed"] };
}

export const SOCKET_EVENTS = {
  joinRoom: "join_room",
  leaveRoom: "leave_room",
} as const;
