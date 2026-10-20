# AGENTS.md

## Project

Piper is a visual AI pipeline builder: users compose pipelines of nodes on a canvas (Angular frontend), run them in a playground, and deploy them as APIs. Pipelines and node packages are defined by an open YAML/JSON-schema spec, and node logic is JavaScript executed at runtime.

The repo uses git submodules — clone with `--recurse-submodules` or run `make install`:

- `backend/core-kit` — shared infra library (env, logger, queue, redis, stream, io, server, transform, clickhouse, mailer, …). Imported as `core-kit/...`.
- `frontend/src/ui-kit` — shared Angular UI components.
- `translator` — i18n translation tool.

## Commands

Root (`Makefile`, reads optional `config.env`):

- `make install` — init submodules and `npm install` backend, frontend, translator
- `make lint` / `make lint-fix` — ESLint with the recommended `@typescript-eslint` rules for backend and frontend; `make lint-backend` / `make lint-frontend` run either package. Generated output and submodules are excluded.
- `make up` / `make down` / `make stop` — local infra via `tools/compose/compose.yaml` (mongo, redis, kafka, clickhouse, deno, nginx, imgproxy)
- `make mongo-migrate` / `make clickhouse-migrate` — apply migrations from `migrations/{mongo,clickhouse}`
- `make mongo-migrate-add` / `make clickhouse-migrate-add` — create a new migration (interactive name prompt)
- `make test` — backend test typecheck + Vitest fast tests, then `make test-frontend`; `make test-integration` runs the Docker-backed integration suite
- `make test-frontend` — frontend test typecheck, test lint and Karma fast suite; `make test-frontend-browser` builds en+ru and runs the Playwright workflows
- `make schemas` — compile `backend/schemas/*.json` into `backend/schemas/compiled.json` and copy it to `frontend/src/schemas/compiled.json`. Run after editing any schema.

Backend (`cd backend`; TypeScript run directly via `tsx`, no build step; config from `backend/.env`, template in `.env.template`):

- `npm run server` — HTTP API (+ serves the built frontend and injects `PRERENDER` config into `index.html`)
- `npm run worker` — BullMQ workers; select subsets with `npm run worker -- -w process_rapid_nodes run_launches` (worker ids are the keys of the `Workers` map in `worker.ts`), `-h` adds a health endpoint
- `npm run periodic` — periodic tasks (`periodic/`)
- `npm run sockets` — socket.io server (clients join rooms keyed by user id / launch id)
- `npm run cli -- <cmd>` — admin CLI (`cli/`): `users add`, `env [set|remove]`, `modules [add|remove|update]`, `workers reboot`, `schemas compile`, `migrations …`, `debug server`
- `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`
- `npm test`, `npm run test:watch`, `npm run test:coverage` — Vitest fast tests
  without Docker; `npm run test:typecheck` checks test types. See
  `backend/tests/README.md` for isolation and mocking rules.
- `npm run test:integration` — disposable MongoDB/Redis containers, real BullMQ
  workers, and Deno smoke tests; requires Docker Compose v2. See
  `backend/tests/integration/README.md` for service isolation and cleanup.
- Tests use preparation, action, and assertions separated by blank lines. Keep
  model transformations real and provide explicit factories for infrastructure
  mocks.

Frontend (`cd frontend`, Angular 17 with `@angular/localize`):

- `npm start` — dev server; app is reached through nginx at `http://localhost/`
- `npm run build` — localized production build
- `npm run i18n` — extract i18n strings to `src/locale/en.json`
- `npm run lint` / `npm run lint:fix` — lint application and test code with ESLint and `@typescript-eslint`
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Jasmine + Karma
  unit and component suites in `tests/unit` and `tests/components` (headless
  Chrome, or `CHROME_BIN`); `npm run test:typecheck`, `npm run lint:tests`.
  Coverage floors live in `karma.conf.cjs`.
- `npm run test:browser` — builds `dist-browser` (en, ru) and runs Playwright
  workflows in `tests/browser` against fixture HTTP/Socket.IO peers (not
  full-stack); needs `npx playwright install chromium`.
- See `frontend/tests/README.md` for isolation, fixture and mocking rules.

VS Code: the "-- all --" launch compound starts server, worker, periodic, sockets, cli and frontend together.

## Architecture

### Backend process model

Several separate entrypoints share one codebase: `server.ts`, `worker.ts`, `periodic.ts`, `sockets.ts`, `oauth.ts`, `metrics.ts`, `chrome.ts`, `cli.ts`. Imports use `baseUrl: ./` (e.g. `app/mongo`, `models/launch`, `consts/redis`).

- **API**: each file in `api/**` registers routes as a side effect on the shared express app (`app/api` → `core-kit/packages/server`); `server.ts` imports each `api/<area>/index.ts`. Handlers are wrapped with `handle(({ currentUser, language }) => async (req, res) => ...)` from `utils/http.ts`, which resolves auth (`user-token` / `api-token` headers) and maps `core-kit` error types to HTTP statuses. A route's return value is sent as the response; use the guards in the same file (`checkLogged`, `checkAdmin`, `checkEngineer`, `checkRoles`, `checkBalance`) and `toModel`/`toModels`/`toPlain`.
- **Models**: classes in `models/` use `class-transformer` decorators (`@Expose`, `@Type`) via `core-kit/packages/transform` (`toInstance`, `toPlain`, `mapTo`). Data crossing Redis, Mongo, queues and HTTP is always converted through these.
- **Storage**: MongoDB (`app/mongo.ts`) for durable entities (users, projects, node packages, deploys, …). Redis holds the _live_ launch state — launch, node inputs/outputs/status/logs/jobs, locks, heartbeats — with key builders in `consts/redis.ts`. ClickHouse holds analytics (usage, metrics, messages, errors), fed from Kafka streams declared in `app/streams.ts`. S3-compatible storage (`app/s3.ts`, `app/storage.ts`) for assets and artefacts.
- **Queues**: all BullMQ queues are declared in `app/queues.ts` (wrapped by `core-kit/packages/queue` `JobsQueue`, with typed job models in `models/jobs`). Job handlers live in `jobs/` and register with `queues.x.process(...)` when imported; `worker.ts` maps worker ids to queues and lazy-loads the handler modules. Adding a new queue means: declare it in `app/queues.ts`, add the handler in `jobs/`, register it in `worker.ts`.

### Pipeline execution flow

1. Launching a project (`api/projects/launch-project.ts` → `packages/launches/launching.ts`) writes the launch to Redis and plans a `run_launch` job.
2. `jobs/run-launch.ts` enforces per-scope concurrency (`maxConcurrent`, Redis list per scope, heartbeats to drop dead launches), then `kick`s the launch.
3. Each node is planned via `packages/nodes/plan-node.ts` onto one of four queues by its `execution` type — `rapid`, `regular`, `deferred`, `protracted` — which differ in concurrency, rate limits and timeouts.
4. `jobs/process-node/process-node-handler.ts` gathers inputs from upstream flows, locks the node, and runs the node's JavaScript `run` function remotely in a **Deno** sandbox service via HTTP (`packages/deno/execute.ts`, `DENO_URL`). Node environment/secrets come from `jobs/process-node/environment.ts`. Results produce outputs, logs, progress, artefacts, `RepeatNode`/`NextNode` decisions, and plan downstream nodes.
5. Side effects are pushed to separate queues (set inputs/outputs/errors, save artefacts, record usage, update balance) and Kafka streams; progress is pushed to clients with `notify()` (socket.io rooms) from `core-kit/packages/io`.

Billing (cost per node, user balance checks) is gated by `BILLING_ACTIVE` in `consts/billing.ts`.

### Schemas

JSON Schemas in `backend/schemas/` (pipeline, node, node-package, project, flow, launch-request, user) are the source of truth for the pipeline spec. They are dereferenced into `compiled.json`, used for AJV validation on the backend (`app/ajv.ts`) and for editors on the frontend. Never edit `compiled.json` by hand — run `make schemas`.

### Frontend

Angular 17 app in `frontend/src`: feature components in `app/`, HTTP layer in `services/`, route data via `resolvers/`, models mirroring backend classes in `models/` (also `class-transformer`). Runtime config (billing, captcha, auth features, URLs) is injected by the backend into `window.PRERENDER`. Routes are language-prefixed (`/:language/...`); the backend serves each locale's built `index.html`.

### Deployment

`devops/docker/Dockerfile` builds a single image (CI in `.github/workflows/build.yml` pushes to GHCR on `main`). Production runs on Docker Swarm (separate `piper-swarm` repo).
