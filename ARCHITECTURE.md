# Architecture

Piper is a visual AI pipeline builder. Users design pipelines of nodes on a canvas, run them in a playground, and deploy them as HTTP APIs. A pipeline is a JSON/YAML document; each node carries its own JavaScript `run` function, which is executed in a remote Deno sandbox at launch time.

This document describes how the system is put together. For setup and commands see `README.md` and `CLAUDE.md`.

## System overview

```
                         ┌──────────────────────── nginx (:80) ────────────────────────┐
                         │  /            → frontend (Angular dev server / static build) │
                         │  /api         → server.ts                                    │
                         │  /socket.io/  → sockets.ts                                   │
                         │  /oauth       → oauth.ts                                     │
                         │  /xyz/        → imgproxy                                     │
                         └──────────────────────────────────────────────────────────────┘
                                   │                    │
                     HTTP (REST)   ▼                    ▼  socket.io (rooms)
                          ┌──────────────┐      ┌──────────────┐
                          │  server.ts   │      │  sockets.ts  │◄──── Redis pub/sub adapter ◄── notify()
                          └──────┬───────┘      └──────────────┘                                  ▲
                                 │ plan jobs                                                     │
                                 ▼                                                               │
   ┌───────────┐   BullMQ   ┌──────────────┐  HTTP   ┌───────────────┐                           │
   │ periodic  │──────────► │  worker.ts   │───────► │ Deno sandbox  │                           │
   └───────────┘   (Redis)  │  (jobs/)     │         │ (piper-deno)  │                           │
                            └──────┬───────┘         └───────────────┘                           │
                                   │ ────────────────────────────────────────────────────────────┘
          ┌────────────────────────┼────────────────────────┬─────────────────────┐
          ▼                        ▼                        ▼                     ▼
   ┌────────────┐          ┌──────────────┐          ┌────────────┐        ┌────────────┐
   │   Redis    │          │   MongoDB    │          │   Kafka    │──────► │ ClickHouse │
   │ live state │          │ durable data │          │  streams   │ Kafka  │ analytics  │
   └────────────┘          └──────────────┘          └────────────┘ engine └────────────┘
                                                                          + S3 (assets, artefacts, outputs)
```

## Repository layout

| Path | Contents |
|---|---|
| `backend/` | Node.js/TypeScript backend: all server-side processes share this codebase |
| `backend/core-kit/` | Submodule: shared infra (env, logger, queue, redis, stream, io, server, transform, clickhouse, mailer, i18n, errors) |
| `frontend/` | Angular 17 SPA, localized with `@angular/localize` |
| `frontend/src/ui-kit/` | Submodule: shared Angular UI components |
| `translator/` | Submodule: tool for translating locale files |
| `migrations/` | Mongo (JSON index definitions) and ClickHouse (SQL) migrations |
| `tools/compose/` | Local infra: docker compose and nginx config |
| `devops/docker/` | Production Dockerfile (single image for every backend process) |
| `misc/` | Sample node YAML and Redis maintenance scripts |

## Backend processes

One codebase, several entrypoints. Each runs with `node --import=tsx <entry>.ts`; there is no compile step.

| Entrypoint | Role |
|---|---|
| `server.ts` | Express REST API (`/api/**`). Also serves the built frontend: it picks the locale's `index.html` for `/:language/*` and injects runtime config into `window.PRERENDER` (billing, captcha, auth features, assistant, URLs). |
| `worker.ts` | BullMQ consumers. Worker groups (`process_rapid_nodes`, `run_launches`, `set_launches_io`, …) map to one or more queues; `-w` selects the groups. Has graceful shutdown (120s) and an optional `/health` endpoint. |
| `sockets.ts` | socket.io server. Clients `join_room` / `leave_room`; rooms are user ids, launch ids, or topic names such as `updating_packages`. |
| `periodic.ts` | In-process scheduler (bottleneck): checks node package updates, deletes launches and artefacts older than `MAX_STORE_LAUNCH_DAYS`. |
| `oauth.ts` | Google / Yandex OAuth (passport), separate express app. |
| `metrics.ts` | Prometheus `/metrics` endpoint exporting BullMQ queue metrics. |
| `chrome.ts` | Puppeteer-controlled Chrome service (used by browser-automation nodes). |
| `cli.ts` | commander CLI: users, environment, modules, workers, schemas, migrations, debug. |

Any process can push events to browsers: `notify(room, event, payload)` from `core-kit/packages/io` emits through the socket.io Redis adapter, so workers do not need a socket connection of their own.

## Backend code organization

```
backend/
  api/<area>/        route modules; importing the file registers its routes
  app/               singletons: api (express), mongo, queues, streams, s3, storage, ajv, llm, cli, nocodb
  consts/            env-derived config; consts/redis.ts holds every Redis key builder
  models/            class-transformer models (+ models/jobs for queue payloads)
  packages/          domain logic (launches, deploy, deno, nodes, node-packages, pipelines, environment, users, oauth)
  jobs/              BullMQ job handlers
  periodic/          periodic tasks
  schemas/           JSON Schemas (source of truth for the pipeline spec) + compiled.json
  utils/             http (handle/guards), node I/O conversion, redis value codecs, files, media
```

### Request handling
- `server.ts` imports every `api/<area>/index.ts`; each route file calls `api.get/post/...` on the shared express instance.
- Handlers are wrapped in `handle(({ currentUser, language }) => async (req, res) => result)` from `utils/http.ts`. It:
  - authenticates the caller from the `user-token` (JWT) or `api-token` header (API tokens are checked in Redis);
  - resolves the language;
  - serializes the returned value;
  - maps `core-kit/types/errors` (`DataError`, `NotFoundError`, `UnauthorizedError`, `TooManyRequestsError`, …) to HTTP statuses.
- Authorization is done with explicit guards inside handlers: `checkLogged`, `checkAdmin`, `checkEngineer`, `checkRoles`, `checkBalance`.

### Models and serialization
Every boundary (HTTP, Mongo, Redis, queues, Kafka, Deno) goes through `class-transformer` via `core-kit/packages/transform` (`toInstance`, `toPlain`, `mapTo`, `validate`). Models in `models/` declare their shape with `@Expose` / `@Type`; maps such as `pipeline.nodes`, `pipeline.flows` and `node.inputs` are real `Map`s once instantiated.

## Data stores

| Store | What lives there | Access |
|---|---|---|
| **MongoDB** | Users, projects (each embeds its pipeline), deploys, launches (summary, without pipeline), launch artefacts, node catalog (`nodes`), node packages, assets, batches, categories, tags, comments, assistant chat messages | `app/mongo.ts` (one typed collection per entity) |
| **Redis** | Everything about a *running* launch: the launch document, node inputs/outputs/state/status/progress/logs/jobs, flow completion sets, processing locks, heartbeats, pipeline outputs and errors, scope queues. Also deploys (the hot copy used by the deploy API), global and per-user environment, API tokens, balance locks. Also the BullMQ backend and socket.io adapter. | `core-kit/packages/redis`; keys in `consts/redis.ts`; launch keys expire after `LAUNCH_EXPIRED` (7 days by default) |
| **Kafka** | Append-only event streams: `pipeline.messages`, `pipeline.usages`, `pipeline.errors`, `pipeline.metrics.outputs`, `pipeline.metrics.finished` | `app/streams.ts` (`core-kit/packages/stream`) |
| **ClickHouse** | Analytics tables fed from Kafka by `Kafka` engine tables plus materialized views (see `migrations/clickhouse`); `user_balance_refills` and `pipeline_usages` are the source of truth for balances | `core-kit/packages/clickhouse` |
| **S3** | Uploaded assets, launch artefacts, pipeline outputs (separate buckets, resolved by `app/storage.ts`) | `app/s3.ts`, `app/storage.ts` |

## Pipeline model

A **pipeline** (`models/pipeline.ts`, `schemas/pipeline.json`) has:
- `nodes: Map<id, Node>` — each node has typed `inputs`/`outputs`, a JavaScript `script` exporting `run`, an `execution` class, an optional `environment` (variables with a scope), a catalog entry, and a `sign`;
- `flows: Map<id, NodeFlow>` — edges `from.output → to.input`, with a `mode` (`wait` by default, or `move`) and an optional `transformer` (`json` path extraction, `array` index);
- `inputs` / `outputs` — pipeline-level I/O. Input flows feed node inputs; output flows collect node outputs;
- `start.nodes` — entry nodes planned when a launch starts.

I/O values are typed (`boolean`, `integer`, `float`, `string`, `string[]`, `json`, `image`, `image[]`, `video`, …). They are stored in Redis as strings via `utils/redis.ts` (`toRedisValue` / `fromRedisValue`; arrays are `|`-joined).

**Projects** wrap a pipeline with a default `launchRequest`, an environment, metadata and visibility. **Node packages** (YAML, validated by `schemas/node-package.json`) publish reusable nodes into the `nodes` catalog. They can be imported from a URL and are checked for updates periodically.

### Node signing and sandbox isolation
`packages/nodes/sign-node.ts` hashes the node's script (whitespace-stripped) together with its environment scopes and `NODE_SIGN_SALT`.
- Nodes installed from packages are signed.
- When a project is patched, a node whose signature no longer matches is rejected, unless the user is an engineer, in which case it is re-signed.
- At execution time, signed nodes run with `isolation: "none"`; unsigned nodes run with `isolation: "process"` in the Deno sandbox.

Environment variables are resolved per node in `jobs/process-node/environment.ts`. Each variable's scope (`global`, `user`, `pipeline`) controls where it is read from: global and user environments live in Redis, the pipeline environment comes from the launch. Secrets are stored encrypted (`packages/environment/crypt-environment.ts`) and masked in API responses.

## Launch lifecycle

```
POST /api/projects/:id/launch          POST /api/[:prefix/]:slug/launch (deployed API)
            │                                       │  (deploy read from Redis)
            └───────────────┬───────────────────────┘
                            ▼
            packages/launches/launching.ts  run()
            • seed NODE_INPUT keys from request / defaults / pipeline input flows
            • upload data-URI images & videos to S3
            • compute costs (if billing active)
            • insert launch summary in Mongo, full launch JSON in Redis
                            │
            scope activated? ──yes──► push to scope list ► queue run_launch
                            │                                   │ jobs/run-launch.ts:
                            no                                  │ wait until position < maxConcurrent
                            │                                   │ (dead launches dropped via heartbeat)
                            ▼                                   ▼
                          kick(): plan start nodes (or request's inclusive nodes)
                            │
                            ▼
            packages/nodes/plan-node.ts → queue by node.execution
              rapid      (concurrency 50, sandbox timeout 3s)
              regular    (40, 20s)
              deferred   (20, 60s)
              protracted (30, 300s)
                            │
                            ▼
            jobs/process-node/process-node-handler.ts
```

### Node processing (`process-node-handler.ts`)
1. Bail out if the launch was interrupted, the node already holds the *processed* lock, or the node is outside the request's `inclusive` set.
2. For each incoming `wait` flow, require its id in the `NODE_FLOWS` set. Otherwise exit; an upstream node will plan this node again.
3. Read inputs from Redis, check required inputs, and convert them.
4. Take the *processing* lock and start a launch heartbeat (Redis key + `launch_heartbeat` event every 10s).
5. Call the Deno service (`packages/deno/execute.ts` → `DENO_URL`) with `{ script, fn: "run", payload: { schema, inputs, state, env }, timeout, isolation }`. Logs from the run are appended to `NODE_LOGS`.
6. Interpret the result by its `__type`:
   - **`repeat`** — save `state` and `progress`, then reschedule the same job with a delay (`DelayedError`). This is how long-running or polling nodes (for example, waiting on an external AI API) work without blocking a worker.
   - **`next`** — handle the outputs and plan follow-up work:
     - convert the outputs (media may be re-uploaded to S3) and store them in `NODE_OUTPUTS`;
     - optionally queue an artefact save;
     - set the processed lock (unless `behavior` is not `normal`) and optionally reset inputs;
     - for every outgoing flow, write the (transformed) value into the target's `NODE_INPUT`, mark the flow done in the target's `NODE_FLOWS`, clear the target's status/state/progress/processed lock, and plan the target;
     - plan any explicit `kicks`;
     - write matching pipeline outputs (`PIPELINE_OUTPUT`), queue `set_launch_output`, and send an output metric.
7. When every pipeline output is filled, the launch is finished:
   - remove it from its scope queue;
   - send a `finished` metric;
   - notify the user with `pipeline_done`;
   - record pipeline-level usage.
8. Per-node costs (`costs × UNIT_COST`) are recorded when billing is active.

Failures go to `process-node-error.ts`:
- sets the node status to `error` and emits `node_error`;
- writes to the `pipeline.errors` stream;
- after the final attempt, writes the error into the launch errors.

`FatalError`, `TimeoutError` and `MemoryLimitError` (thrown inside node scripts or by the sandbox) are not retried: the error is recorded and the job is removed. Other errors go through BullMQ retries and are reported to Sentry.

Workers never hold launch state in memory; everything lives in Redis. This lets any worker pick up any node, and lets nodes re-plan each other freely. Idempotency comes from the processing/processed locks.

### Side-effect queues
These run in the `set_launches_io` worker group and similar, so node processing stays fast:

| Queue | Job | Effect |
|---|---|---|
| `set_launch_inputs` | `jobs/set-launch-inputs.ts` | Persist launch inputs to the Mongo launch, emit `set_inputs` |
| `set_launch_output` | `jobs/set-launch-output.ts` | Build output data (`PIPELINE_OUTPUT_DATA`), insert into `launchArtefacts`, update the Mongo launch, emit `set_output` |
| `save_node_artefacts` | `jobs/save-launch-artefacts.ts` | When the request sets a `bucket`, store node outputs as `launchArtefacts` |
| `set_launch_errors` | `jobs/set-launch-errors.ts` | Copy `PIPELINE_ERRORS` to the Mongo launch, emit `set_errors` |
| `pipelines_usage` | `jobs/record-pipeline-usage.ts` | Send to the `pipeline.usages` stream, then schedule a balance update |
| `users_update_balance` | `jobs/update-user-balance.ts` | Recompute balance from ClickHouse (refills − usages), save to Mongo, emit `user_balance_updated` |
| `packages_updates` / `update_package` | `jobs/check-package-updates.ts`, `jobs/update-package.ts` | Node package update checks and installs |

## Deploys (pipelines as APIs)
`POST /api/projects/:id/deploy` snapshots the project's pipeline, launch request, environment and concurrency `scope` into a `Deploy`.
- The deploy is stored in Mongo and in Redis under `deploy[:prefix]:slug`. Non-admins may deploy only under their own user id as the prefix.
- The public endpoint `POST /api/[:prefix/]:slug/launch` reads the deploy from Redis, merges the request body into the deployed launch request, checks balance and rate limits, and calls the same `launches.run()` with notifications off.
- Callers poll the launch state and data endpoints under `/api/launches/:id`.

## Billing
Billing is enabled with `BILLING_ACTIVE=yes` (`consts/billing.ts`).
- Launch costs are estimated up front (`packages/pipelines/pipeline-costs.ts`); actual usage is recorded per node and per pipeline.
- Balances are derived in ClickHouse and cached on the user document.
- `checkBalance` blocks launches in production when the remaining balance is ≤ 0.
- Refills come from an external billing service (`BILLING_URL`).

## Other subsystems
- **Assistant** (`api/projects/assistant`, `app/llm.ts`): an OpenAI-compatible LLM with tool definitions. It proposes pipeline changes, which are validated against the compiled schema and re-signed before saving. Enabled with `ACTIVATE_ASSISTANT`.
- **DMS** (`api/dms`, `app/nocodb.ts`): databases backed by NocoDB.
- **Batches** (`api/batches`): named batches a user creates; they are stored in Mongo and listed through the API.
- **Assets / artefacts**: user uploads and saved launch results in S3; images are served through imgproxy.

## Schemas
`backend/schemas/*.json` define the pipeline spec: pipeline, node, flow, node-package, project, launch-request and user.
- `cli schemas compile` (`make schemas`) dereferences them into `compiled.json` and copies it to `frontend/src/schemas/`.
- The backend validates imports and assistant output with AJV (`app/ajv.ts`). The frontend uses the same schemas for the JSON/YAML editors.

## Frontend
Angular 17 module-based app (`frontend/src`):
- `app/` — feature components:
  - project list and projects;
  - the visual pipeline editor (`edit-pipeline-*`, `edit-node-*`, `edit-flow-transformer`);
  - playground, launches and node inspection (`node-logs`, `node-jobs`, `node-state`, `node-outputs`);
  - deploy and API playground (`deploy-pipeline`, `play-via-api`);
  - node packages, assets, artefacts, expenses, users, assistant.
- `services/` — `http.service.ts` (REST), `live.service.ts` (socket.io rooms for launch and user events), `me.service.ts`, `project.manager.ts` (editing state for the open project).
- `resolvers/` and `guards/` load route data and handle auth. `models/` mirrors backend models with class-transformer.
- Runtime config comes from `window.PRERENDER`, injected by the backend.
- Builds are per locale (`ng build --localize`), and every route is language-prefixed.

## Local infrastructure and deployment
- `tools/compose/compose.yaml` runs mongo, redis (redis-stack), kafka, clickhouse, the `piper-deno` sandbox image, imgproxy and nginx. The app processes run on the host, and nginx proxies to them via `host.docker.internal`:
  - frontend: 4200
  - server: 8081
  - sockets: 8082
  - oauth: 8083
  - nocodb: 8085
- Production: `devops/docker/Dockerfile` builds a single image. GitHub Actions pushes it to GHCR on `main`, and it is deployed to Docker Swarm (separate `piper-swarm` repo), where each process runs as its own service and worker groups are scaled independently.
