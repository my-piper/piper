# Backend tests

Use the Node.js major in the root `.nvmrc` (CI and production use it too; both
Vitest configs read it and refuse to start on other majors), initialize the
`core-kit` submodule, and run `npm ci` in `backend`.

```sh
npm test                 # Run fast tests once; no Docker or services required
npm run test:watch       # Watch fast tests
npm run test:coverage    # Run fast tests and write coverage/
npm run test:typecheck   # Check tests, helpers, config, and imported application types
npm run lint:tests
npm run test:integration  # Disposable Docker services, real workers and real Deno
```

Unit tests live in `tests/unit`. Shared setup and small helpers live in `tests` and
`tests/helpers`. Infrastructure suites live in `tests/integration` and are
excluded from fast runs. See [their README](integration/README.md) for isolation,
service setup, and cleanup.

The runner uses Piper's TypeScript settings, including `baseUrl`, JSON imports,
and legacy decorators. Setup loads `reflect-metadata` before application models.
Keep model conversion, validators, and business logic real.

Vite's `.env` loading is disabled. Test workers discard inherited application
environment variables, retain OS and Vitest settings, and set `NODE_ENV=test`,
`ENV=test`, `TZ=UTC`, and silent logging. `core-kit/env` returns that controlled
environment without executing dotenv; direct `dotenv.config()` calls fail.
Use `vi.stubEnv` to select environment-dependent behavior explicitly. Restore
module state with `vi.resetModules()` before dynamic imports when testing values
that are captured at import time.

MongoDB, Redis, storage, streams, and queue entry points fail on import unless a
suite provides an explicit `vi.mock` factory. For example:

```ts
const { redis } = vi.hoisted(() => ({ redis: { get: vi.fn() } }));

vi.mock("core-kit/packages/redis/redis", () => ({ default: redis }));
```

Mock the exact boundary imported by the code under test. Return only the methods
the scenario needs; avoid emulating entire services. Do not use automatic mocks
or `importOriginal` on modules that connect during import. The harness smoke test
demonstrates using the real Redis transformation helper with a client double.
TCP, TLS, and fetch calls fail immediately. These guards are active during
application imports and reinstalled before tests. HTTP suites permit only their
temporary `127.0.0.1` server's exact port; other localhost ports remain blocked.

Structure tests as preparation, action, and assertions separated by blank lines.
Keep branching out of test bodies: give `it.each` rows explicit inputs and
expected values (for example `{ headers, status }` or `{ fail, releasesLock }`).
Do not pin suspected bugs as passing tests; use `it.fails` with the intended
behavior and record the gap in the contract docs.
Mocks, environment/global stubs, and real timers are restored between tests. Set
mock results in each test and close any resources created by the suite.

Data contract suites in `tests/unit/contracts` cover Redis wire values, nested
model maps and dates, exposed fields, the Redis store of the Launch live state,
and production pipeline/launch-request schema validation. Small reusable
fixtures are in `tests/fixtures`. Suites in `tests/unit/utils` exercise real
node input/output conversion with explicit storage and download doubles.

A Launch's live state (`packages/launches/live-state`) runs on its in-memory
store in unit tests: `tests/helpers/live-state.ts` swaps the Redis store for
one `MemoryStore` per test file and exports `liveState` to prepare and assert
it, so tests check Launch and Node state, not Redis calls. Import it (or a
boundary helper that re-exports it) before application modules, and clear
`liveStore` between tests (the reset helpers do). `spyOnLiveState(method)`
spies on a transition of the application's instance too, e.g. to make it fail.
Only suites that pin the stored wire format read raw keys from the store.

Execution suites in `tests/unit/execution` cover the live state itself,
planning, launch persistence and starting nodes, readiness guards, node results
and downstream flows, repeat/next behavior, worker errors, and environment
precedence/decryption. `tests/helpers/execution-boundaries.ts` supplies
explicit MongoDB, Redis client (for the Environment and Deploys), queue, Deno,
storage, stream, and notification doubles. Import this helper first so its
module factories are registered before application imports. The helpers do not
emulate BullMQ semantics.

Use fixed launch/job IDs and fake time for execution tests. Heartbeat tests
advance fake timers while Deno is pending and check that no timers remain after
success, failure, or a late refresh. Environment tests use real encryption and
decryption with test values. Suites changing configuration reload application
modules after stubbing it; import error constructors from that same module
generation when asserting their types.

HTTP suites in `tests/unit/http` use pinned Supertest against the real Express
app without importing `server.ts`. `http-app.ts` reloads modules, initializes real
error decorators before asynchronous mock factories, and loads only explicitly
selected route files. It closes ephemeral loopback servers after each test.
`http-boundaries.ts` controls storage/queue/Deno/reporting boundaries; JWT,
bcrypt, authorization, validators, transformations, and launch logic remain real.
`http-scenario.ts` selects controlled test secrets, users, and time.
Only `Date` is faked so HTTP request timers continue to run normally.

See [the HTTP contract reference](../../docs/backend-http-contracts.md) for current
permissions, statuses, and token handling. The workspace
sandbox requires permission to bind temporary local sockets (`listen EPERM`
otherwise); ordinary local/CI runs need no Docker or services. Every HTTP request
has a bounded timeout (`HTTP_REQUEST_TIMEOUT`, set once on the harness agent), and the harness verifies that unrelated network access
stays blocked and route registrations do not leak between app instances.

Defaults apply only to absent or `undefined` values; `false`, `0`, and `""` are
preserved. The JSON launch-request schema rejects `null`. Internal `null` values
are preserved through model/Redis storage, prevent default substitution, and are
treated as unfilled inputs by readiness and execution conversion. JSON text
`"null"` is parsed as a JSON value and is distinct from an explicit null input.
Conversion does not fill defaults itself. Launching still applies direct node
defaults only to missing required inputs; pipeline inputs and cost estimation use
their configured defaults for missing values.

Coverage reports include Piper application modules, including uncovered modules,
and exclude schemas, dependencies, submodule internals, test support, and process
entry points. LCOV and HTML reports are written to `backend/coverage`. Global
thresholds in `vitest.config.ts` sit just below current coverage and fail
`npm run test:coverage` on regressions; raise them when adding suites. Real infrastructure tests run
separately from coverage.

CI checks the test types and lint, runs coverage and integration tests on the `.nvmrc` Node.js version, uploads reports,
and requires the backend test job to pass before building/publishing the image.
The focused typecheck avoids unrelated existing backend errors involving unused
core-kit MySQL/Telegram dependencies and `packages/vm/utils`.
