# Running a pipeline from another pipeline

Research note. Question: "How do you run a pipeline from another pipeline? I
know there is some JS API for it."

All claims cite the source at the time of writing (`main`, after commit
`8f9deac`). Inferences are marked **(inference)**.

## Short answer

- The JS API you remember is `require("@piper/node").nested.run(slug, request)`
  plus `nested.state(id)`. It is defined in
  `backend/jobs/process-node/context.ts:107-140`, but **it is dead code**: since
  commit `3146562` ("feat: move script execution to deno") node scripts run in
  the remote Deno sandbox. That commit removed the `createContext` import from the
  handler, and nothing in `backend/` imports `context.ts` any more.
  `context.ts:20` also imports `packages/vm/utils`, which no longer exists.
- In the current runtime, the only way for a node script to start another
  pipeline is to call Piper's own HTTP API from the script with `fetch`:
  `POST /api/[:prefix/]:slug/launch` for a deployed pipeline, or
  `POST /api/projects/:id/launch` for a project. You authenticate with an
  `api-token` header and then poll `GET /api/launches/:id/state` for outputs.
- No shipped "run sub-pipeline" node type exists in this repo. Node packages
  live in the external `my-piper/piper-nodes` repo, which this note did not check.

## 1. The (legacy) in-process JS API: `@piper/node` → `nested`

Defined in `backend/jobs/process-node/context.ts`:

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
  `http://deno/` (`backend/packages/deno/costs.ts:3`).
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
`frontend/src/resolvers/launches-filter.ts:19-20`). Only the dead `nested.run`
ever set `parent` (`context.ts:133`). The HTTP launch endpoints never do
(`api/deploys/launch-deploy.ts:38-55`, `api/projects/launch-project.ts:107-123`).

## 2. The working path: calling Piper's HTTP API from a node script

### Endpoints

| Purpose | Endpoint | Source |
| --- | --- | --- |
| Launch a deployed pipeline | `POST /api/:slug/launch`, `POST /api/:prefix/:slug/launch` | `api/deploys/launch-deploy.ts:60-61` |
| Launch a project directly | `POST /api/projects/:_id/launch` | `api/projects/launch-project.ts:41-43` |
| Poll outputs and errors | `GET /api/launches/:id/state` | `api/launches/launch-state.ts:6-10` |
| Rich output data (images, video and so on) | `GET /api/launches/:id/data` | `api/launches/launch-data.ts:6-10`, `launching.ts:272-291` |
| Get an API token | `POST /api/me/api-token/generate` | `api/users/generate-api-token.ts:12-29` |

The UI's "play via API" page shows the same curl calls: the launch call with an
`api-token` header and the state poll
(`frontend/src/app/play-via-api/play-via-api.component.html:18-32`).

### Auth

- The `handle()` wrapper reads the `user-token` or `api-token` header
  (`backend/utils/http.ts:29-30`). An `api-token` must pass JWT verification and
  match the bcrypt hash stored in Redis (`utils/http.ts:121-139`). The user is
  then loaded from Mongo (`utils/http.ts:141-156`). On failure the response is
  `401 Wrong API token` (`utils/http.ts:157-160`).
- Generating a token replaces the previous one. Only one hash is stored per user
  (`generate-api-token.ts:22-26`), and the UI warns about this
  (`play-via-api.component.ts:54-57`). Tokens live for 5 years
  (`consts/redis.ts:84`).
- The sandbox gets no Piper credentials automatically. `env` holds only the
  variables that the node declares in its `environment` block, resolved from
  the global, user or pipeline environment (`jobs/process-node/environment.ts:26-86`)
  and decrypted (`environment.ts:88-92`). It arrives in the script as
  `env.variables.<NAME>`, because `toPlain` turns the Map into an object
  (`process-node-handler.ts:269`, `transformers/primitive.ts:26-38`). Declared
  variables follow the node schema: `title`, `type` (`boolean|number|string`)
  and `scope` (`global|user|pipeline`) (`backend/schemas/node.json:111-113,436-466`).
  A user stores secrets with `PUT /api/me/environment`, which encrypts them
  (`api/environment/set-me-environment.ts:11-33`).
- The child launch runs as the token's owner. `launchedBy` is the current user
  (`launch-deploy.ts:39-42`, `launch-project.ts:108-111`). This is not
  necessarily the parent launch's user. **(inference)**
- `GET /api/launches/:id/state` and `/data` have no auth check. The handlers
  never call `checkLogged` (`launch-state.ts:8`, `launch-data.ts:8`), so the
  launch id alone is enough.

### Request and response shape

- The body is deep-merged over the deploy's or project's stored launch request
  (`launch-deploy.ts:32-35`, `launch-project.ts:74-77`). The `LaunchRequest`
  fields are `options`, `inclusive.nodes`, `inputs` (pipeline-level inputs,
  keyed by pipeline input id) and `nodes.<nodeId>.{inputs,outputs}`
  (`models/launch-request.ts:18-55`). Pipeline inputs are routed to node inputs
  through `pipeline.inputs[*].flows`. Data URIs for `image` and `video` inputs
  are uploaded to storage first (`launching.ts:111-155`).
- `comment` in the body overrides the launch comment for deploy launches
  (`launch-deploy.ts:37,54`).
- The response is `{ _id, url }` (`launch-deploy.ts:56`). The project launch
  returns the whole launch except `pipeline` (`launch-project.ts:124-126`).
- `GET .../state` returns `{ launchedAt, errors: string[], outputs }`.
  `outputs` holds only the child pipeline's pipeline-level `outputs`, read from
  `PIPELINE_OUTPUT` keys. `json` outputs are parsed (`launching.ts:242-270`,
  `models/launch.ts:353-368`). The child pipeline must declare `outputs`, or
  nothing comes back.
- There is no "finished" flag in `LaunchState` (`models/launch.ts:353-368`).
  The backend itself treats a launch as finished once every pipeline output is
  filled (`jobs/process-node/complete-node.ts:273-291`). A caller should poll
  until all expected outputs are present or `errors` is non-empty.
  **(inference from those two facts)**

### Sync or async

It is async. `launches.run()` writes the launch to Mongo and Redis and then
either kicks it or queues a `run_launch` job. It returns right away
(`launching.ts:182-209`). Nothing waits for outputs, so the caller must poll.

### How errors surface

- Launch-time errors are HTTP statuses: `DataError` gives 400 (for example
  "Deploy … is not found" from `packages/deploy/get-deploy.ts:23-25`, or balance
  and rate-limit errors), and you also get 401, 404 and 429
  (`utils/http.ts:175-197`).
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
  list when all pipeline outputs are filled (`complete-node.ts:287-292`).
  Launches whose heartbeat has died are pruned (`run-launch.ts:41-48`). Only
  deploy launches carry a scope; `launch-project.ts` passes none
  (`launch-project.ts:107-123`).
- **Billing.** Both endpoints call `checkBalance`. It is a no-op unless
  `BILLING_ACTIVE`; in production it rejects a balance of 0 or less
  (`utils/http.ts:236-247`). Deploy launches also run `checkRateLimits` when
  billing is active (`launch-deploy.ts:28-30`). By default that allows 5
  requests per 60 s window, and only when `RATE_LIMIT_MIN_BALANCE > 0` and the
  user's available balance is below it (`packages/users/check-rate-limits.ts:6-55`).
  The project launch instead accrues the estimated cost against a short-lived
  Redis balance when `TRACK_BALANCE` is set (`launch-project.ts:81-105`). Each
  child launch is costed as its own launch (`launching.ts:157-159`).
- **Recursion and loop guards.** None found. Apart from the `parent` field,
  which is only stored and filtered on, grep finds no depth or recursion checks
  in `jobs/` or `packages/`. A pipeline that launches its own deploy would keep
  spawning launches, bounded only by balance, rate limits and scope
  concurrency. **(inference)**
- **Network reachability.** The script must reach the Piper API from inside the
  Deno container. Locally, nginx on the host proxies to the app processes
  (`ARCHITECTURE.md:239`). The right base URL depends on the deployment, so
  store it as an env variable rather than hard-coding it. **(inference)** The
  sandbox does support `fetch`: the assistant's example node uses it
  (`api/projects/assistant/consts.ts:54-65`).

## 4. Minimal worked example

This is built only from the facts above. Assumptions:

- the child project is deployed under slug `my-child` with prefix
  `<userId>`, has a pipeline input `prompt` and a pipeline output `result`;
- the user stored `PIPER_URL` and `PIPER_API_TOKEN` with
  `PUT /api/me/environment`.

The node returns plain `{__type: ...}` objects, so it does not depend on the
external `utils/node.js`.

```yaml
# node fragment
execution: regular
environment:
  PIPER_URL:
    title: Piper base URL
    type: string
    scope: user
  PIPER_API_TOKEN:
    title: Piper API token
    type: string
    scope: user
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

- Does the `piper-deno` image or `piper-nodes/utils/node.js` provide its own
  `nested` helper? Their source is outside this repo and needs checking there.
- Should `nested.run` be restored in the Deno world? It would need a backend
  callback endpoint and a way to pass a launch-scoped credential into the
  sandbox. Neither exists today.
