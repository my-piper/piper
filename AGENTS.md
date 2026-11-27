# AGENTS.md

## Project

Piper is a visual AI pipeline builder: users compose pipelines of nodes on a canvas (Angular frontend), run them in a playground, and deploy them as APIs. Pipelines and node packages are defined by an open YAML/JSON-schema spec, and node logic is JavaScript executed at runtime.

The repo uses a git submodule — clone with `--recurse-submodules` or run `make install`:

- `backend/core-kit` — shared infra library (env, logger, queue, redis, stream, io, server, transform, clickhouse, mailer, …). Imported as `core-kit/...`.

Sibling checkouts, when present next to this repo: `../piper-deno` is the sandbox runtime that executes node scripts. The node catalog is the `realistic-ai/piper/nodes` GitLab repo (`nodes/<package>/`, the `utils/node.js` helpers `next`, `repeat` and errors, and `make pack` for Package Archives); tools that read it take its checkout from `$PIPER_NODES_DIR`.

## Commands

Scripts live in the root `Makefile` (reads optional `config.env`) and in `backend/package.json` / `frontend/package.json`; read them there. This section only adds what they can't tell you.

Setup and environment:

- `make install` initializes the submodule, enables the git hooks in `.githooks` (`core.hooksPath`) and installs backend and frontend. The pre-commit hook checks staged `package.json`/lockfile pairs with `tools/check-lockfile.sh` (`npm ci --dry-run`), the install-script and the denied-dependency checks.
- Node: the major in `.nvmrc` is the single source (`backend/.nvmrc` and `frontend/.nvmrc` link to it, CI passes it to the Dockerfile; `make check-node-version` checks `engines` and the Dockerfile default).
- npm 11 runs dependency install scripts only when listed in `allowScripts` in that package's `package.json`, pinned to the locked version. After adding or upgrading a package with install scripts (native modules, esbuild), run `npm install-scripts ls` and `npm install-scripts approve <pkg>`. Pins are exact on purpose (supply-chain review on every bump); `make check-install-scripts` and CI fail while any pin is stale, because npm itself only warns and skips the script.
- Backend runs TypeScript directly via `tsx` (no build step), configured by `backend/.env` (template `.env.template`). Local infra (mongo, redis, kafka, clickhouse, deno, nginx, imgproxy) comes from `make up` (`tools/compose/compose.yaml`); the frontend dev server is reached through nginx at `http://localhost/`.
- After editing any `backend/schemas/*.json`, run `make schemas`.
- Lint covers backend and frontend application and test code; generated output and submodules are excluded.

Tests:

- Backend fast tests (`npm test`) need no Docker; integration tests (`npm run test:integration`) start disposable MongoDB/Redis containers, real BullMQ workers and Deno smoke tests, and need Docker Compose v2. Rules: `backend/tests/README.md` and `backend/tests/integration/README.md`.
- Frontend fast suites (`tests/unit`, `tests/components`) run in Vitest browser mode on Playwright's Chromium; the Playwright workflows (`tests/browser`) run against fixture HTTP/Socket.IO peers, not the full stack. Both need `npx playwright install chromium`. Running, focusing and rules: `frontend/tests/README.md`.
- `ng build` skips strict template type checks; CI runs them separately (`typecheck:templates`).
- Tests separate preparation, action and assertions with blank lines, keep model transformations real and use explicit factories for infrastructure mocks.

VS Code: the "-- all --" launch compound starts server, worker, periodic, sockets, cli and frontend together.

## Architecture

### Backend process model

Several separate entrypoints share one codebase: `server.ts`, `worker.ts`, `periodic.ts`, `sockets.ts`, `oauth.ts`, `metrics.ts`, `registry.ts`, `chrome.ts`, `cli.ts`. `npm run worker -- -w <ids>` runs a subset of workers (ids are the keys of the `Workers` map in `worker.ts`; `-h` adds a health endpoint); the admin CLI (`npm run cli -- <cmd>`, `cli/`) manages users, environment, modules, migrations and schema compilation. Imports use `baseUrl: ./` (e.g. `app/mongo`, `models/launch`, `consts/redis`).

- **API**: each file in `api/**` registers routes as a side effect on the shared express app (`app/api` → `core-kit/packages/server`); `server.ts` imports each `api/<area>/index.ts`. Handlers are wrapped with `handle(({ currentUser, language }) => async (req, res) => ...)` from `utils/http.ts`, which resolves auth (`user-token` / `api-token` headers) and maps `core-kit` error types to HTTP statuses. A route's return value is sent as the response; use the guards in the same file (`checkLogged`, `checkAdmin`, `checkEngineer`, `checkRoles`) and `toModel`/`toModels`/`toPlain`.
- **Models**: classes in `models/` use `class-transformer` decorators (`@Expose`, `@Type`) via `core-kit/packages/transform` (`toInstance`, `toPlain`, `mapTo`). Data crossing Redis, Mongo, queues and HTTP is always converted through these.
- **Storage**: MongoDB (`app/mongo.ts`) for durable entities (users, projects, node packages, deploys, …). Redis holds the _live_ launch state — launch, node inputs/outputs/status/logs/jobs, locks, heartbeats — with key builders in `consts/redis.ts`. ClickHouse holds analytics (metrics, messages, errors, runs), fed from Kafka streams declared in `app/streams.ts`. S3-compatible storage (`app/s3.ts`, `app/storage.ts`) for assets and artefacts.
- **Queues**: all BullMQ queues are declared in `app/queues.ts` (wrapped by `core-kit/packages/queue` `JobsQueue`, with typed job models in `models/jobs`). Job handlers live in `jobs/` and register with `queues.x.process(...)` when imported; `worker.ts` maps worker ids to queues and lazy-loads the handler modules. Adding a new queue means: declare it in `app/queues.ts`, add the handler in `jobs/`, register it in `worker.ts`.

### Pipeline execution flow

1. Launching a project (`api/projects/launch-project.ts` → `packages/launches/launching.ts`) writes the launch to Redis and plans a `run_launch` job.
2. `jobs/run-launch.ts` enforces per-scope concurrency (`maxConcurrent`, Redis list per scope, heartbeats to drop dead launches), then `kick`s the launch.
3. Each node is planned via `packages/nodes/plan-node.ts` onto one of four queues by its `execution` type — `rapid`, `regular`, `deferred`, `protracted` — which differ in concurrency, rate limits and timeouts.
4. `jobs/process-node/process-node-handler.ts` gathers inputs from upstream flows, locks the node, and runs the node's JavaScript `run` function remotely in a **Deno** sandbox service via HTTP (`packages/deno/execute.ts`, `DENO_URL`). Node environment/secrets come from `jobs/process-node/environment.ts`. Results produce outputs, logs, progress, artefacts, `RepeatNode`/`NextNode` decisions, and plan downstream nodes.
5. Side effects are pushed to separate queues (set inputs/outputs/errors, save artefacts) and Kafka streams; progress is pushed to clients with `notify()` (socket.io rooms) from `core-kit/packages/io`.

### Node packages

A Node Package is published from a YAML (scripts inline or by CDN URL) or from a Package Archive: a zip uploaded to `api/node-packages/upload-archive.ts`, checked by `packages/node-packages/archive.ts` and written to a private S3 bucket per `<package>/<version>`. Its nodes store `script: registry:<package>@<version>/<path>`, which `packages/deno/execute.ts` resolves against `REGISTRY_URL` before calling Deno; `registry.ts` serves those files to Deno, and `piper-deno` must list the registry host in `ALLOW_IMPORT_HOSTS`. A published version never changes, so each upload needs a greater version (ADR 0003).

The built-in `core` package (`backend/builtin-packages/core/<version>/node.js`: `next`, `repeat`, errors, `createNested`, `httpClient`, `download`) ships in the image and is served by the registry without an upload; inline scripts import `"registry:core@<version>/node.js"`. Released versions are frozen by `tests/unit/registry/builtin-releases.test.ts`: change it in a new version folder (ADR 0010).

### Schemas

JSON Schemas in `backend/schemas/` (pipeline, node, node-package, project, flow, launch-request, user) are the source of truth for the pipeline spec. They are dereferenced into `compiled.json`, used for AJV validation on the backend (`app/ajv.ts`) and for editors on the frontend. Never edit `compiled.json` by hand — run `make schemas`.

### Frontend

Angular 22 app in `frontend/src`: feature components in `app/`, HTTP layer in `services/`, route data via `resolvers/`, models mirroring backend classes in `models/` (also `class-transformer`). Runtime config (captcha, auth features, URLs) is injected by the backend into `window.PRERENDER`. The app is built in English only, under `/en/`. Templates keep their `i18n` markers, but nothing is extracted or translated, and Localized Texts in data (`en=…;de=…`) always resolve to English.

The UI is Taiga UI (#92). Shared pipes and directives live in `pipes/` and `directives/` and are declared in `app/shared.module.ts` for non-standalone components; providers live in `providers/`. Global styles are in `src/styles/` (design tokens in `themes.scss`, the size scale in `sizes.scss`, Sass helpers and legacy names in `variables.scss`, breakpoints in `mixins.scss`, Piper-owned layout helpers in `layout.scss`). Before building UI, read `docs/design.md` (tokens, size scale, canvas specs, link to the design system) and `docs/taiga-ui-notes.md`.

To look at a page in a browser without the backend or an account, run `npm run browser:serve` in `frontend/`: it serves the app with the browser workflows' fixture API on `http://127.0.0.1:4300` and prints the sign-in.

### Deployment

`devops/docker/Dockerfile` builds a single image (CI in `.github/workflows/build.yml` pushes to GHCR on `main`). Production runs on Docker Swarm (separate `piper-swarm` repo).
