# Frontend tests

Plan, status and evidence: [docs/frontend-testing-plan.md](../../docs/frontend-testing-plan.md).

| Suite                                             | Runner                           | Location            | Needs                                                   |
| ------------------------------------------------- | -------------------------------- | ------------------- | ------------------------------------------------------- |
| Unit (models, pipes, services, guards, resolvers) | Jasmine + Karma, headless Chrome | `tests/unit/`       | Chrome/Chromium                                         |
| Component (real templates via TestBed)            | Jasmine + Karma, headless Chrome | `tests/components/` | Chrome/Chromium                                         |
| Browser workflows                                 | Playwright (Chromium)            | `tests/browser/`    | Playwright Chromium (`npx playwright install chromium`) |

None of these suites needs Docker, the backend, MongoDB/Redis or nginx.
Browser workflows run the real frontend against **fixture** HTTP and Socket.IO
peers: they are frontend integration tests, not full-stack tests. Backend
behaviour is covered separately by `backend/tests`.

## Prerequisites

- Node and the frontend lockfile: `npm ci` in `frontend/`. Development and CI
  use Node 22 (Dockerfile); the harness was also verified on Node 26. Angular
  17.3's published matrix lists Node 18/20 only, so Node 22+ is a tested
  deviation, not an officially supported combination.
- A Chrome or Chromium binary for Karma. `karma-chrome-launcher` finds a system
  Chrome; otherwise set `CHROME_BIN`, e.g. to Playwright's Chromium
  (`npx playwright install chromium`).

## Commands (run in `frontend/`)

| Command                          | What it does                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm test`                       | Unit + component suites, headless, single run                                                  |
| `npm run test:watch`             | Same, rebuilding and re-running on file changes                                                |
| `npm run test:coverage`          | Single run with coverage in `coverage/` (HTML, lcov, json-summary, text summary)               |
| `npm run test:typecheck`         | `tsc` over all fast-suite specs, helpers and fixtures                                          |
| `npm run lint:tests`             | ESLint over `tests/` and the Karma config                                                      |
| `npm run test:browser`           | Builds en+ru (`production,browser-test` → `dist-browser/`), then runs the Playwright workflows |
| `npm run test:browser:run`       | Runs the Playwright workflows against an existing `dist-browser/`                              |
| `npm run test:browser:typecheck` | `tsc` over `tests/browser` (Node + Playwright types, no Jasmine)                               |

Filter while iterating with `fdescribe`/`fit` (never commit them) or narrow
discovery: `npx ng test --watch=false --include=../tests/unit/models`. Paths
passed to `--include` are relative to `src/`, which is the Angular source root.

Angular compiles every component exercised by a spec with the application's
compiler, so template errors fail the run; `test:typecheck` alone does not
check templates.

## Layout

- `setup.ts` — Karma entry: `reflect-metadata`, TestBed environment
  (`errorOnUnknownElements`/`errorOnUnknownProperties`, destroy after each), and
  the isolation layer. `zone.js`, `zone.js/testing` and `@angular/localize/init`
  are loaded as polyfills from `angular.json` before it.
- `helpers/` — explicit infrastructure doubles: `config.ts` (PRERENDER/AppConfig,
  stored authorization), `socket.ts` (`SocketDouble` for ngx-socket-io),
  `isolation.ts` (global guards).
- `fixtures/` — `plain.ts` wire payloads and `runtime-config.ts`, both free of
  Angular/Jasmine imports so the browser suite can share them; `models.ts`
  typed factories converting those payloads through the production
  `toInstance`.
- `unit/`, `components/` — specs (`*.spec.ts`).
- `browser/` — Playwright specs and fixture servers.

## Isolation rules (enforced by `helpers/isolation.ts`)

Before every spec: `localStorage`, `sessionStorage` and cookies are cleared and
`PRERENDER` is reset to `testRuntimeConfig()` (billing, captcha, assistant and
OAuth off, dummy base URL). After every spec the spec **fails** if it:

- issued an application `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`
  request (only Karma's own `/_karma_webpack_/` and `/base/` paths are allowed) —
  use `provideHttpClientTesting()` + `HttpTestingController` (and call
  `verify()`), and `provideSocketDouble()` for sockets;
- left elements attached to `<body>` after TestBed teardown.

`fakeAsync` already fails a spec that leaves timers queued. Jasmine runs specs
in random order and fails specs without expectations.

## Writing tests

- Separate preparation, action and assertions with blank lines.
- Keep model decorators, `toInstance`/`toPlain`, jsondiffpatch, YAML parsing,
  forms and domain transformations real. Build models from fixtures; never cast
  plain objects into model types to skip Maps/Dates.
- Install config/authorization **before** constructing providers:
  `provideTestConfig({...})`, `seedAuthorization(userPlain())`.
- Fixtures return fresh objects on every call; mutate freely.
- Compile real templates. Stub only heavyweight boundaries (Monaco, hCaptcha,
  JSON editor) with explicit inputs/outputs; do not use `NO_ERRORS_SCHEMA` or
  replace the template under test.
- Use `fakeAsync`/`tick` for debounces and UI delays, or RxJS `TestScheduler`
  for isolated streams — never both in one spec.
- Assert intended behaviour. If a test exposes a bug, fix it narrowly with the
  test, or record it in the plan as a follow-up; never skip it silently.

## Wire contracts

`fixtures/plain.ts` documents the backend source of every payload (patch route
and response, DataError bodies, node/launch events, rooms). Notable facts:

- Revision conflicts are HTTP **400** with a text body (backend `DataError`),
  not 409. Errors with details are `{ message, details }`.
- Node events are `{ launch, node }`; there is no `event` field on the wire.
- Socket rooms are joined/left with the room **name** (`backend/sockets.ts`).
- Artefact `data.type` is the class-transformer discriminator.

## Browser workflows (`tests/browser/`)

- `support/server.ts` serves `dist-browser/{en,ru}` on `127.0.0.1` (random
  port, SPA fallback per locale) and replaces the HTML's `PRERENDER = {};` in
  memory, failing unless it occurs exactly once. It also hosts a real Socket.IO
  server (websocket transport) handling `join_room`/`leave_room` like
  `backend/sockets.ts`.
- `support/api.ts` is a per-test stateful `/api/**` fixture; each route cites
  the backend handler it mirrors. PATCH checks the revision, applies real
  jsondiffpatch deltas and validates against the compiled schema. Unhandled API
  requests fail the test.
- `support/test.ts` gives each test a fresh context, seeds authorization once
  per tab, fulfils font requests, and fails on other external requests and on
  page/console errors not explicitly allowed by the test.
- One worker, no retries; traces and screenshots are kept on failure in
  `test-results/` (HTML report in `playwright-report/` on CI).
- Filter with `npm run test:browser:run -- canvas.spec.ts` or `-g "<title>"`.
- Known product bug pinned with `test.fail`: owners cannot delete their own
  deployment (see the plan's T007 record); the test turns red once fixed.

Karma can reuse Playwright's Chromium:
`CHROME_BIN=$(node -e 'console.log(require("@playwright/test").chromium.executablePath())') npm test`.

## Troubleshooting

- `No binary for ChromeHeadless browser`: install Chrome or set `CHROME_BIN`.
- `Executable doesn't exist` from Playwright: `npx playwright install chromium`
  (add `--with-deps` on fresh Linux hosts).
- Port 9876 busy: Karma picks the next free port automatically.
- `Found 1 load error`: a compile error in a spec; it is printed above the
  Karma banner.
