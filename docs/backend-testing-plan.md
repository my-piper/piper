# Backend testing implementation plan

Status: steps 1–3 implemented; steps 4–5 pending.

Start with pipeline correctness, then add API and infrastructure coverage. Deliver the work in five small PRs, with PRs 1–2 forming the first milestone.

## Current constraints

- `backend/package.json` provides fast test, watch, coverage, and test typecheck
  commands. Harness usage and isolation rules are documented in
  [`backend/tests/README.md`](../backend/tests/README.md).
- Production uses Node.js 22, TypeScript through `tsx`, ESM, and `baseUrl` imports such as `app/mongo` and `models/launch`.
- Models use decorators and `class-transformer`; tests must preserve the runtime transformation behavior.
- Importing `app/mongo` connects to MongoDB. Importing the core-kit Redis module connects to Redis. Queue construction and worker registration also happen during module loading.
- `core-kit/env.ts` loads `.env`, so tests must establish controlled configuration before application imports.
- `core-kit` is a git submodule. Keep changes in Piper where possible; any necessary shared-library change requires a separate submodule change.
- CI runs the backend harness on Node.js 22 before building the application image.

## 1. Establish the test harness — implemented

Recommended runner: **Vitest**. Its explicit module mock factories can replace infrastructure modules without executing the original imports. See the [Vitest module mocking documentation](https://vitest.dev/guide/mocking/modules.html).

Tasks:

- Verify runner compatibility with Node.js 22, ESM, `baseUrl` imports, JSON imports, legacy decorators, and model transformations before committing to the configuration.
- Pin compatible dependency versions during implementation.
- Configure isolated test settings before application imports and prevent development credentials from being loaded.
- Replace infrastructure imports with explicit test doubles in fast tests; fail on unexpected external connections.
- Add `test`, `test:watch`, and `test:coverage` scripts.
- Organize tests under `backend/tests/unit` and `backend/tests/integration`, with small shared fixtures and helpers.
- Ensure test files participate in appropriate TypeScript and lint checks.
- Add a GitHub Actions test job with recursive submodule checkout and the same Node.js version as production. Make successful tests a prerequisite for publishing the image.

Acceptance criteria: fast tests run without Docker, make no external connections, and exit cleanly both locally and in CI.

Implementation: pinned Vitest 5.0.5, Vite 8.3.4, and V8 coverage; 10 smoke and
isolation tests cover ESM/baseUrl/JSON imports, legacy decorators, real model
transformation with an explicit Redis double, controlled environment loading, and
blocked infrastructure/network access. `test:typecheck` checks tests and their
imports separately from existing unrelated backend type errors. CI includes
recursive submodule checkout, test lint/type checks, coverage artifacts, and a
required dependency from the image build job. CI execution remains to be verified
after pushing.

## 2. Cover data contracts and input handling — implemented

Prioritize behaviors used throughout pipeline execution:

- Redis serialization and deserialization of booleans, numbers, strings, JSON, and `null` in `backend/utils/redis.ts`.
- Model round trips through plain objects, including nested maps, dates, and exposed fields.
- Required inputs, defaults, malformed JSON, and input/output conversion in `backend/utils/node.ts`.
- Valid and invalid pipeline and launch-request schema fixtures using the production validators.

Resolved regression: launch propagation and pipeline/node cost estimation used
`value || input.default`, replacing valid `false`, `0`, and empty-string values
with defaults. Defaults now apply only to absent or `undefined` values.

Write regression tests for intended behavior, including the distinction between absent values and valid falsy values. Decide the intended treatment of `null` explicitly. Keep confirmed defect fixes separate from harness setup, with their regression tests accompanying the fixes.

Acceptance criteria: representative pipeline data survives validation, transformation, and serialization without losing values.

Implementation: 129 domain tests (139 total with the harness) cover Redis wire
values, nested model maps/dates and exposed fields, required-input readiness,
JSON and array conversion, media storage boundaries, production AJV validators
with compiled schemas, and launch/cost input preservation. Regression tests
reproduced the falsy/default defect before its fix. Model tests also exposed and
fixed output-map deserialization selecting models by the discriminator name
instead of each entry's discriminator value.

Null policy: the JSON launch-request schema continues to reject `null`. Internal
explicit `null` values are preserved in model maps and Redis, do not trigger a
default, count as unfilled required inputs, and are omitted from converted
execution/cost inputs. JSON text `"null"` remains a distinct supported JSON value.
Optional direct node defaults retain their existing launch behavior: only missing
required node inputs receive defaults at launch.

Validation: run `npm test`, `npm run test:coverage`, `npm run test:typecheck`, and
`npx --no-install eslint tests vitest.config.ts` in `backend`. Fast tests pass on
Node.js 22 without Docker or external connections. Execution coverage follows in
step 3; HTTP contracts and real infrastructure remain in steps 4–5.

## 3. Cover launch and node execution — implemented

Keep domain logic real. Mock Redis, MongoDB, queues, Deno execution, storage, and notifications at their boundaries. Do not mock model conversion or the business logic under test.

Prioritize:

- Queue selection for all four execution types in `backend/packages/nodes/plan-node.ts`.
- Launch defaults, input propagation, and selected starting nodes in `backend/packages/launches/launching.ts`.
- Missing launch or node, interrupted launch, unmet inputs, and unfinished upstream flows.
- Already processed and already running nodes.
- Successful outputs and downstream scheduling.
- `RepeatNode`, `NextNode`, execution errors, and lock/timer cleanup.
- Environment precedence and decryption failures in `backend/jobs/process-node/environment.ts`.
- Cost calculation and its error behavior in `backend/packages/pipelines/pipeline-costs.ts`.

Extract callable handlers from worker registration only where necessary. Avoid a broad dependency-injection or application architecture rewrite. Use deterministic time and IDs, and restore mocks and timers after each test.

Acceptance criteria: success and failure paths assert resulting state and scheduled work. Fast tests do not start real workers or leave timers and connections open.

Implementation: 77 execution tests (216 total) in `backend/tests/unit/execution`
cover all four node queues and execution timeouts, launch persistence and scoped
scheduling, starting-node selection, readiness and duplicate guards, output flow
conversion, pipeline completion, repeat/next behavior, logs and worker error
reporting, environment precedence with real encryption/decryption, billing modes,
and cost totals/errors. Fixtures use fixed time and IDs. Infrastructure factories
mock only client boundaries; model conversion, Redis serialization helpers,
environment resolution, and scheduling logic remain real.

Four regressions reproduced heartbeat timers surviving lock/status/unlock
failures or restarting after execution when an in-flight refresh completed late.
The handler now covers heartbeat/lock/status setup with cleanup, stops the timer
before attempting unlock, and prevents late refreshes from scheduling a new
timer. A lock is released only after successful acquisition. The existing
NextNode completion code moved into `jobs/process-node/complete-node.ts`, keeping
both modules under 400 lines and preserving the default handler entry point.

Cost contracts retain existing behavior: Deno/service execution failures return
zero estimates; invalid structured costs, malformed inputs, and environment
decryption failures propagate errors. An empty inclusive starting-node selection
continues to schedule no nodes. Error notification/retry behavior is documented
by tests without changing the worker's existing contract.

Validation: fast tests and coverage pass on Node.js 22 without Docker; test
typechecking, test lint, and formatting pass. Real BullMQ retries, locks,
duplicate delivery, and scope concurrency remain integration work in step 5.
The focused production lint check retains the same 17 existing rule violations
as the original handler; source lint cleanup is outside this testing step.

## 4. Add HTTP contract tests

Exercise the Express app without importing the production `server.ts` entrypoint. Use an HTTP request helper such as Supertest, selecting a compatible version during implementation. Load only the routes needed by each suite and isolate route registration between suites.

Cover:

- Valid, invalid, expired, and revoked tokens.
- Owner, admin, and unauthorized project operations.
- Request validation and response serialization.
- Error-to-status mapping in `backend/utils/http.ts`.
- Billing enabled and disabled, plus insufficient-balance behavior. Exercise relevant environment modes explicitly because balance checks depend on them.

Document existing API behavior first. Resolve ambiguous permission rules or status changes explicitly rather than silently changing the contract to match conventional expectations. Keep authentication and authorization logic real while controlling its storage dependencies.

Acceptance criteria: representative project and launch routes have both allowed and rejected request cases, without starting the production server or unrelated services.

## 5. Verify real infrastructure behavior

Add a separate `test:integration` command using disposable MongoDB and Redis containers, including real BullMQ workers. Use dedicated test services rather than the development Compose stack and its persistent volumes.

Cover:

- Persisting and retrieving a launch.
- Processing a small pipeline with deterministic Deno responses.
- Retries, delayed jobs, duplicate delivery, locks, and scope concurrency.
- Cleanup of queues, workers, connections, and test data, including after failures.

Configure both the application Redis client and BullMQ's separate Redis connection. Isolate databases and queues between runs; run integration suites serially initially if shared state cannot yet be isolated reliably. Use readiness checks and bounded polling for asynchronous completion instead of fixed sleeps.

Add a small smoke suite against the real Deno service afterward. Keep external AI providers stubbed. Kafka, ClickHouse, object storage, and socket delivery can receive dedicated integration coverage when their behaviors are explicitly in scope.

Acceptance criteria: integration tests pass repeatedly without timing-dependent failures or leftover resources, locally and in CI.

## Test conventions and scope

- Structure tests as preparation, action, and assertions, separated by blank lines.
- Assert observable behavior and contracts rather than reproducing implementation details.
- Prefer small, readable fixtures for users, nodes, pipelines, and launches.
- Keep real Redis and queue semantics in integration tests; elaborate in-memory substitutes should not become a second implementation of those services.
- Track coverage initially, then introduce thresholds for covered modules as the suite grows. Exclude generated schemas and dependency/submodule internals from Piper's coverage targets.
- Run the checks relevant to each PR and document its test command and acceptance criteria.

The first milestone is PRs 1–2: a reliable CI harness and meaningful data-correctness coverage. Later PRs build on that foundation in the order above.
