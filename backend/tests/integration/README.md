# Backend integration tests

Use Node.js 22 and a running Docker daemon with Docker Compose v2:

```sh
npm run test:integration
npm run test:integration -- pipeline.test.ts --reporter=verbose
npm run test:integration -- deno.test.ts
```

The command starts MongoDB, Redis, and the project's pinned Deno image from
`compose.yaml`. Every invocation gets a random Compose project, Mongo database,
and loopback ports. MongoDB and Redis data live in container tmpfs; no development
services, fixed ports, persistent volumes, or credentials are used. Images are
downloaded on the first run. Suites run serially and are excluded from `npm test`.

The runner waits for database health checks, supplies `PIPER_TEST_MONGO_URL`,
`PIPER_TEST_MONGO_DATABASE`, `PIPER_TEST_REDIS_PORT`, and `PIPER_TEST_DENO_URL`,
then invokes the integration Vitest config. These settings are generated for the
run; do not point them at an existing stack. Setup validates them, discards
inherited application settings, and prevents `.env` loading. The application
Redis client uses database 1, while BullMQ's independent connection uses database 5. Host connections are restricted to the three allocated service ports.

Pipeline tests exercise real MongoDB persistence, both Redis clients, Piper's
queue wrappers, production worker registrations, and node/launch logic. Only
Deno execution, analytics, notifications, error reporting, and object storage
boundaries have explicit factories. Deterministic Deno results keep retry and
scheduling cases independent of providers. Model transformations remain real.

The Deno smoke suite uses the real HTTP adapter and service image, checking both
isolation modes, serialized values, logs, and exception mapping. Scripts are local
and do not call external AI providers. Service readiness and job completion use
bounded polling; delayed jobs are explicitly promoted after their delayed state
has been asserted.

Suite teardown closes all application queues/workers and observer queues, drops
the test database, clears both Redis databases, and closes all clients. A failure
case checks BullMQ deduplication and queue/event/worker cleanup. The outer runner
removes its containers, volumes, and network in `finally`, including startup/test
failures and SIGINT/SIGTERM. An uncatchable kill or daemon failure can prevent
cleanup; the printed `piper-tests-*` project name identifies that run for manual
`docker compose -f tests/integration/compose.yaml -p <project> down -v` cleanup.

The same command runs in CI before image publication. Kafka, ClickHouse, object
storage, and socket delivery remain outside this suite's scope.
