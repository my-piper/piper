# Backend tests

Use Node.js 22.12 or newer (CI and production use Node.js 22), initialize the
`core-kit` submodule, and run `npm ci` in `backend`.

```sh
npm test                 # Run fast tests once; no Docker or services required
npm run test:watch       # Watch fast tests
npm run test:coverage    # Run fast tests and write coverage/
npm run test:typecheck   # Check tests, helpers, config, and imported application types
npx --no-install eslint tests vitest.config.ts
```

Unit tests live in `tests/unit`. Shared setup and small helpers live in `tests` and
`tests/helpers`. Infrastructure suites will live in `tests/integration` and are
excluded from fast runs.

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
TCP, TLS, and fetch calls fail immediately, including connections to localhost.
These guards are active during application imports and reinstalled before tests.

Structure tests as preparation, action, and assertions separated by blank lines.
Mocks, environment/global stubs, and real timers are restored between tests. Set
mock results in each test and close any resources created by the suite.

Coverage reports include Piper application modules, including uncovered modules,
and exclude schemas, dependencies, submodule internals, test support, and process
entry points. LCOV and HTML reports are written to `backend/coverage`; thresholds
will be introduced as domain coverage grows. The initial smoke suite verifies the
harness, so application coverage is intentionally small.

CI checks the test types and lint, runs coverage on Node.js 22, uploads reports,
and requires the backend test job to pass before building/publishing the image.
The focused typecheck avoids unrelated existing backend errors involving unused
core-kit MySQL/Telegram dependencies and `packages/vm/utils`.
