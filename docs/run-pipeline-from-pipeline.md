# Running a pipeline from another pipeline

Research note. Question: "How do you run a pipeline from another pipeline? I
know there is some JS API for it."

All claims cite the source at the time of writing (`main`, after commit
`8f9deac`). Inferences are marked **(inference)**.

## Short answer

- **Use a Run Deploy node** to run one Deploy and use its outputs. Pick the
  Deploy in the canvas's node search or palette (your own Deploys are listed;
  another user's is added by its link or `prefix/slug`). The node's inputs and
  outputs are the Deploy's pipeline inputs and outputs, and it needs no script.
  See "Run Deploy node" below and
  [ADR 0011](adr/0011-deploy-as-native-node-source.md).
- **Use a Child Launch from a script** when the node must choose the Deploy at
  runtime or start several children. A node script returns
  `{ __type: "launch", launches: [{ key, deploy: { prefix, slug }, inputs }] }`.
  The backend starts each child from the Deploy, and on every later run passes
  `children.<key> = { launch, status, outputs }` into the script. The script then
  returns `repeat` until `status` is `"finished"`, and then `next`. See section 0
  and [ADR 0001](adr/0001-child-launches-by-returned-instruction.md). The sandbox
  needs no token and never calls Piper.
- The old `require("@piper/node").nested.run` API
  (`backend/jobs/process-node/context.ts`) was dead code once scripts moved to
  the Deno sandbox in `3146562`. It has now been deleted. Neither `piper-deno`
  (a stateless function runner) nor `piper-nodes/utils/node.js` (`next`,
  `repeat`, errors) offered a replacement.
- Piper's public HTTP API (section 2) is still the way to launch a pipeline
  from **outside** Piper. Inside a node, prefer Child Launches.

## Run Deploy node

A node with `source: deploy` runs its Deploy as a Child Launch without a
script:

```yaml
nodes:
  summarize:
    source: deploy
    deploy: { prefix: <userId>, slug: summarizer }
    inputs:  { prompt: { type: string } }
    outputs: { result: { type: string } }
```

| Rule | Behaviour |
| --- | --- |
| Spec | `deploy: { prefix, slug }` is required with `source: deploy`, and such a node has no `script` (`backend/schemas/node.json`). |
| Sockets | Copied from the Deploy's pipeline `inputs` and `outputs` when the node is added (`GET /api/deploys/[:prefix/]:slug/sockets`). Every input is a port. "Refresh from deploy" on the canvas re-copies them and drops wires to sockets the Deploy no longer has; a warning badge shows a mismatch. |
| Version | The Deploy's current version runs; nothing is pinned. |
| Run | `packages/nodes/deploy-node.ts`: the first run starts one child (key `deploy`) with the node's inputs as pipeline `inputs`, empty ones left out so the Deploy's own values apply. Later runs repeat every 3 s while the child runs, then emit its pipeline outputs. Always on the `rapid` queue. |
| Failure | A missing Deploy, or sockets that no longer match (an input or output the Deploy doesn't declare, a required Deploy input the node lacks), fail the node fatally before the child starts. Otherwise the Child Launch rules below apply unchanged. |
| UI | While it runs, the node links to the launch's nested launches. |

## 0. Child Launches

Implemented in `backend/packages/launches/child-launches.ts` and
`backend/jobs/process-node/process-node-handler.ts`.

```js
import { next, repeat } from "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@main/utils/node.js";

export async function run({ inputs, children }) {
  const child = children?.summary;
  if (!child) {
    return {
      __type: "launch",
      launches: [{
        key: "summary",
        deploy: { prefix: "<userId>", slug: "my-child" },
        inputs: { prompt: inputs.prompt },   // pipeline inputs, merged over the deploy's
      }],
      delay: 3000,                            // when to run this node again
    };
  }
  if (child.status !== "finished") return repeat({ delay: 3000 });
  return next({ outputs: { result: child.outputs.result } });
}
```

| Rule | Behaviour |
| --- | --- |
| Source | Only a Deploy, resolved by `prefix` and `slug`. It must declare pipeline outputs, and it must not share the parent's activated concurrency scope (that could deadlock). Otherwise the node fails fatally. |
| Validation | Every request in one instruction is checked (depth, deploy, outputs, scope, fan-out) before any child starts, so a bad request never leaves earlier siblings running. |
| Fan-out | At most 10 children per node. |
| Identity | The child runs as the parent's `launchedBy`. |
| Idempotency | `key -> childId` is saved in `NODE_CHILDREN` **before** the child starts. A key that already has a child is never launched again, so retries don't start duplicates. If starting the child throws, the child is interrupted and the key released, so the retry can start it. |
| `children` payload | `{ [key]: { launch, status: "running" \| "finished", outputs } }`. A child is `finished` when every pipeline output fed by a Flow is filled (`packages/launches/finished.ts`). Pipeline outputs only, with `json` parsed. Failed children never reach the script (see Failure). |
| Failure | If a child has errors, or its launch is missing or expired, the node's other children are interrupted and the parent node fails with a fatal (non-retried) error before its script runs. |
| Depth | `Launch.depth` is 0 for a user's launch and parent + 1 for a child. More than 3 levels fails the node fatally. |
| Interruption | `POST /api/launches/:id/interrupt` interrupts the launch and its children recursively. Children started while their parent was being interrupted are interrupted right after they start. |
| Loops | A node re-planned by a flow forgets its children, as it forgets its `state`. |
| UI | Children carry `parent`, so they appear in the parent launch's "nested" tab. |

## 1. The (deleted) in-process JS API: `@piper/node` → `nested`

Formerly defined in `backend/jobs/process-node/context.ts`, now deleted. It is
kept here for history:

| API | Signature | Behaviour |
| --- | --- | --- |
| `nested.run` | `(slug: string, request: {[key]: Primitive} = {}) => Promise<Launch>` (`context.ts:108-111`) | Loads the deploy by slug with `deploying.get(slug)` (`context.ts:112-118`). It passes no prefix, so only un-prefixed deploys resolve (see `packages/deploy/get-deploy.ts:11-16`). It deep-merges `request` into the deploy's launch request (`context.ts:120-123`) and calls `launches.run()` with the parent launch's `launchedBy`, `parent: launch._id` and the comment `Nested from node <title>` (`context.ts:125-135`). It returns `{ _id, url }` (`context.ts:137`). |
| `nested.state` | `(id: string) => Promise<object>` (`context.ts:139`) | Returns `launching.state(id)`: `{ launchedAt, errors, outputs }` (`packages/launches/launching.ts:242-270`). |

Other members of the same legacy module: `throwError.{data,fatal,timeout}`,
`next`, `repeat`, `messages.defect`, `artefact`, `download`, `useTempFolder` and
`httpRequest` (an axios instance) (`context.ts:78-152`).

Why it is not usable now:

- `process-node-handler.ts` calls `execute(node.script, "run", {...})` from
  `packages/deno` (`backend/jobs/process-node/process-node-handler.ts:260-275`).
  It sends no `require` function and no `nested` object. The payload is only
  `schema.node`, `inputs`, `state` and `env` (`process-node-handler.ts:263-270`).
- `execute` POSTs `{script, fn, payload, timeout, isolation}` to `DENO_URL`
  (`backend/packages/deno/execute.ts:22-27`). `DENO_URL` defaults to
  `http://deno/` (`backend/consts/deno.ts:3`).
- `git show 3146562` removes `import { createContext } from "./context"` and the
  `context: await createContext({...})` call from the handler. A repo-wide grep
  finds no other importer of `jobs/process-node/context.ts`.
- The Deno sandbox source (`ghcr.io/my-piper/piper-deno`,
  `tools/compose/compose.yaml:26`) is not in this repo. So whether the sandbox
  injects its own `nested` helper **cannot be verified here**.
  `analysis/piper/PREFLIGHT.md:45,73` records the same gap. The current script
  helpers come from an ES module on jsDelivr:
  `import { next, throwError } from "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@main/utils/node.js"`
  (`backend/api/projects/assistant/consts.ts:19,31,43`). That file is also
  external, and its exports beyond `next` and `throwError` were not checked.

What still works: the `parent` field. `launches.run()` stores `parent`
(`packages/launches/launching.ts:59,172`; `models/launch.ts:316-318`).
`GET /api/launches?parent=<id>` lists children (`api/launches/list.ts:16,23`).
The UI has a "nested" tab under a launch that uses this filter
(`frontend/src/app/app-routing.module.ts:240-246`,
`frontend/src/resolvers/launches-filter.ts:19-20`). Child Launches (section 0) set
`parent`, as the deleted `nested.run` did. The HTTP launch endpoints never do
(`api/deploys/launch-deploy.ts:31-48`, `api/projects/launch-project.ts:51-67`).

## 2. From outside Piper: the HTTP API

### Endpoints

| Purpose | Endpoint | Source |
| --- | --- | --- |
| Launch a deployed pipeline | `POST /api/:slug/launch`, `POST /api/:prefix/:slug/launch` | `api/deploys/launch-deploy.ts:53-54` |
| Launch a project directly | `POST /api/projects/:_id/launch` | `api/projects/launch-project.ts:12-14` |
| Poll outputs and errors | `GET /api/launches/:id/state` | `api/launches/launch-state.ts` |
| Rich output data (images, video and so on) | `GET /api/launches/:id/data` | `api/launches/launch-data.ts`, `launching.ts:272-291` |
| Get an API token | `POST /api/me/api-token/generate` | `api/users/generate-api-token.ts:12-29` |

The UI's "play via API" page shows the same curl calls: the launch call with an
`api-token` header and the state poll
(`frontend/src/app/play-via-api/play-via-api.component.html:18-32`).

### Auth

- The `handle()` wrapper reads the `user-token` or `api-token` header
  (`backend/utils/http.ts`) and passes them to `resolveUser`
  (`backend/packages/users/resolve-user.ts`). An `api-token` must pass JWT
  verification and match the bcrypt hash stored in Redis, and the user is then
  loaded from Mongo. On failure the response is `401 Wrong API token`.
- Generating a token replaces the previous one. Only one hash is stored per user
  (`generate-api-token.ts:22-26`), and the UI warns about this
  (`play-via-api.component.ts:54-57`). Tokens live for 5 years
  (`USER_API_TOKEN_EXPIRED` in `consts/redis.ts`).
- The sandbox gets no Piper credentials automatically. `env` holds only the
  variables that the node declares in its `environment` block, resolved from
  the global, user or pipeline environment (`jobs/process-node/environment.ts:26-86`)
  and decrypted (`environment.ts:88-92`). It arrives in the script as
  `env.variables.<NAME>`, because `toPlain` turns the Map into an object
  (`process-node-handler.ts:269`, `transformers/primitive.ts:26-38`). Declared
  variables follow the node schema: `title`, `type` (`boolean|number|string`)
  and `scope` (`global|user|pipeline`) (`backend/schemas/node.json:111-113,436-466`).
  Since ADR 0009 the Variable `scope` is gone: a value comes from the
  Project's own override or the Global Environment it is bound to, so a user
  stores such secrets as overrides on the Project.
- The child launch runs as the token's owner. `launchedBy` is the current user
  (`launch-deploy.ts:32-35`, `launch-project.ts:52-55`). This is not
  necessarily the parent launch's user. **(inference)**
- `GET /api/launches/:id/state` and `/data` need a token whose user may see
  the launch: the user who started it, the owner of its project, or an admin
  (`checkLaunchVisible` in `packages/launches/access.ts`). Otherwise they
  answer 404, or 400 without a token. Poll with the same token that launched
  the child.

### Request and response shape

- The body is deep-merged over the deploy's or project's stored launch request
  (`launch-deploy.ts:25-28`, `launch-project.ts:44-47`). The `LaunchRequest`
  fields are `options`, `inclusive.nodes`, `inputs` (pipeline-level inputs,
  keyed by pipeline input id) and `nodes.<nodeId>.{inputs,outputs}`
  (`models/launch-request.ts:18-55`). Pipeline inputs are routed to node inputs
  through `pipeline.inputs[*].flows`. Data URIs for `image` and `video` inputs
  are uploaded to storage first (`launching.ts:111-155`).
- `comment` in the body overrides the launch comment for deploy launches
  (`launch-deploy.ts:30,47`).
- The response is `{ _id, url }` (`launch-deploy.ts:49`). The project launch
  returns the whole launch except `pipeline` (`launch-project.ts:68-70`).
- `GET .../state` returns `{ launchedAt, errors: string[], outputs }`.
  `outputs` holds only the child pipeline's pipeline-level `outputs`, read from
  `PIPELINE_OUTPUT` keys. `json` outputs are parsed (`launching.ts:242-270`,
  `models/launch.ts:353-368`). At least one child pipeline output must be fed
  by a Flow, otherwise Run Deploy refuses the Deploy (`child-launches.ts`).
- There is no "finished" flag in `LaunchState` (`models/launch.ts:353-368`).
  The backend itself treats a launch as finished once every pipeline output fed
  by a Flow is filled (`isFinished` in `packages/launches/finished.ts`). A caller should poll
  until all expected outputs are present or `errors` is non-empty.
  **(inference from those two facts)**

### Sync or async

It is async. `launches.run()` writes the launch to Mongo and Redis and then
either kicks it or queues a `run_launch` job. It returns right away
(`launching.ts:182-209`). Nothing waits for outputs, so the caller must poll.

### How errors surface

- Launch-time errors are HTTP statuses: `DataError` gives 400 (for example
  "Deploy … is not found" from `packages/deploy/get-deploy.ts:23-25`), and you also get 401, 404 and 429
  (`utils/http.ts:178-197`).
- Run-time errors in the child are appended to `PIPELINE_ERRORS`. A message is
  added after the last attempt fails, or immediately for a fatal, timeout or
  memory error (`jobs/process-node/process-node-error.ts:83-112`). These
  messages surface in `state.errors` (`launching.ts:268`). The parent node does
  not learn of them unless it polls.
- Inside the parent script, `throwError.data/fatal/timeout` (from piper-nodes
  `utils/node.js`) or a thrown exception becomes an `ExecutionError`. The handler
  maps it to a typed error (`packages/deno/classes.ts:41-54`,
  `process-node-handler.ts:283`).

## 3. Alternatives and limits

- **Sub-pipeline node types.** None in this repo. The only node YAML is
  `misc/node.yaml`, a messaging example. The `migrations/` directory has no
  launch-related nodes, and a grep for `nested`, `/launch` and `api-token` in
  `migrations/` and `misc/` finds nothing. The catalog lives in the external
  `my-piper/piper-nodes` repo, which was not checked.
- **Execution timeouts.** These apply per Deno call: `rapid` 3 s, `regular`
  20 s, `deferred` 60 s and `protracted` 300 s (`process-node-handler.ts:54-66,272`).
  So a single `run` call cannot wait long for a child launch. The pattern that
  fits is to launch once, then return a repeat result with
  `{ __type: "repeat", state, delay }`. The handler saves `state`, delays the
  job by `delay` (default 1000 ms) and re-runs the script with that `state` in
  the payload (`process-node-handler.ts:197,267,320-348`,
  `types/node.ts:12-24`).
- **Concurrency (`scope.maxConcurrent`).** A deploy can carry a
  `scope { id, activated, maxConcurrent }` (`models/deploy-config.ts:23-27`,
  `models/run-scope.ts:4-16`). A scoped launch is pushed to a Redis list and
  waits in `run_launch` until its position is below `maxConcurrent`
  (`launching.ts:197-200`, `jobs/run-launch.ts:30-68`). It is removed from the
  list when every pipeline output fed by a Flow has a value (`isFinished` in
  `packages/launches/finished.ts`).
  Launches whose heartbeat has died are pruned (`run-launch.ts:41-48`). Only
  deploy launches carry a scope; `launch-project.ts` passes none
  (`launch-project.ts:51-67`).
- **Recursion and loop guards.** Child Launches are capped at 3 levels by
  `Launch.depth` (section 0). Launches started through the HTTP API carry no
  depth. A node that calls the HTTP API to launch its own deploy would still keep
  spawning launches, bounded only by scope concurrency. **(inference)**
- **Network reachability.** The script must reach the Piper API from inside the
  Deno container. Locally, nginx on the host proxies to the app processes
  (`ARCHITECTURE.md:239`). The right base URL depends on the deployment, so
  store it as an env variable rather than hard-coding it. **(inference)** The
  sandbox does support `fetch`: the assistant's example node uses it
  (`api/projects/assistant/consts.ts:54-65`).

## 4. Worked example: polling the HTTP API from a node (superseded by section 0)

This is built only from the facts above. Assumptions:

- the child project is deployed under slug `my-child` with prefix
  `<userId>`, has a pipeline input `prompt` and a pipeline output `result`;
- the user set `PIPER_URL` and `PIPER_API_TOKEN` as overrides in the
  Project Environment.

The node returns plain `{__type: ...}` objects, so it does not depend on the
external `utils/node.js`.

```yaml
# node fragment
execution: regular
environment:
  PIPER_URL:
    description: Piper base URL
    type: string
  PIPER_API_TOKEN:
    description: Piper API token
    type: string
inputs:
  prompt: { type: string, required: true }
outputs:
  result: { type: string }
script: |
  export async function run({ env, inputs, state }) {
    const { PIPER_URL, PIPER_API_TOKEN } = env.variables;
    const headers = {
      "Content-Type": "application/json",
      "api-token": PIPER_API_TOKEN,
    };

    // first call: start the child launch
    if (!state?.launch) {
      const res = await fetch(`${PIPER_URL}/api/<userId>/my-child/launch`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: { prompt: inputs.prompt }, comment: "from parent" }),
      });
      if (!res.ok) throw new Error(`Launch failed: ${res.status} ${await res.text()}`);
      const { _id } = await res.json();
      return { __type: "repeat", state: { launch: _id }, delay: 3000 };
    }

    // later calls: poll the child's state
    const res = await fetch(`${PIPER_URL}/api/launches/${state.launch}/state`, { headers });
    if (!res.ok) throw new Error(`State failed: ${res.status}`);
    const { errors, outputs } = await res.json();
    if (errors?.length) throw new Error(`Child failed: ${errors.join("; ")}`);
    if (outputs?.result === undefined) {
      return { __type: "repeat", state, delay: 3000 };
    }
    return { __type: "next", outputs: { result: outputs.result } };
  }
```

Notes on the example:

- The `next` and `repeat` result shapes match what the handler checks
  (`process-node-handler.ts:320,349`). The integration test returns the same
  `next` shape (`backend/tests/integration/deno.test.ts:23-26`).
- The `environment` block follows `schemas/node.json:436-466`. Variable titles
  must match `^[\w\s]{5,40}$`.
- Nothing above caps the number of repeats. Add your own attempt counter in
  `state` if you need a time-out. **(inference)**
- The child will not appear in the parent's "nested" tab, because the HTTP
  endpoints do not set `parent` (see section 1).

## Open questions

- Should `piper-nodes/utils/node.js` gain a `launch(...)` helper next to `next`
  and `repeat`? That is a follow-up in that repo.
- Should a finished child wake its parent node at once, instead of the parent
  polling on its `delay`?
