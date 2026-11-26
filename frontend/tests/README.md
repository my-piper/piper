# Frontend tests

Plan, status and evidence: [docs/frontend-testing-plan.md](../../docs/frontend-testing-plan.md).

| Suite                                             | Runner                                 | Location            | Needs                                                   |
| ------------------------------------------------- | -------------------------------------- | ------------------- | ------------------------------------------------------- |
| Unit (models, pipes, services, guards, resolvers) | Vitest browser mode, headless Chromium | `tests/unit/`       | Playwright Chromium (`npx playwright install chromium`) |
| Component (real templates via TestBed)            | Vitest browser mode, headless Chromium | `tests/components/` | Playwright Chromium (`npx playwright install chromium`) |
| Browser workflows                                 | Playwright (Chromium)                  | `tests/browser/`    | Playwright Chromium (`npx playwright install chromium`) |

None of these suites needs Docker, the backend, MongoDB/Redis or nginx.
Browser workflows run the real frontend against **fixture** HTTP and Socket.IO
peers: they are frontend integration tests, not full-stack tests. Backend
behaviour is covered separately by `backend/tests`.

## Prerequisites

- Node and the frontend lockfile: `npm ci` in `frontend/`. Development and CI
  use the Node major in the root `.nvmrc` (`frontend/.nvmrc` links to it; CI
  passes it to the Dockerfile and `make check-node-version` checks `engines`).
- Playwright's Chromium (`npx playwright install chromium`): `ng test` runs the
  fast suites in it through `@vitest/browser-playwright`, and the browser
  workflows use it too.

## Commands (run in `frontend/`)

| Command                          | What it does                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm test`                       | Unit + component suites, headless, single run                                                |
| `npm run test:agent`             | Same, but prints only failed tests and the summary (Vitest `agent` reporter); for agent runs |
| `npm run test:watch`             | Same, rebuilding and re-running on file changes                                              |
| `npm run test:coverage`          | Single run with coverage in `coverage/` (HTML, lcov, json-summary, text summary)             |
| `npm run test:typecheck`         | `tsc` over all fast-suite specs, helpers and fixtures                                        |
| `npm run lint:tests`             | ESLint over `tests/` and `vitest.config.ts`                                                  |
| `npm run test:browser`           | Builds en (`production,browser-test` → `dist-browser/`), then runs the Playwright workflows  |
| `npm run test:browser:run`       | Runs the Playwright workflows against an existing `dist-browser/`                            |
| `npm run test:browser:typecheck` | `tsc` over `tests/browser` (Node + Playwright types, no Vitest)                              |

Narrow a run while iterating: `npm run test:agent --
--include=../tests/unit/models` picks files (paths are relative to `src/`, the
Angular source root) and `--filter "<name>"` matches suite and spec names.
Never commit `.only`; ESLint rejects it.

Angular compiles every component exercised by a spec with the application's
compiler, so template errors fail the run; `test:typecheck` alone does not
check templates.

## Layout

- `setup.ts` — Vitest setup file (`setupFiles` in `angular.json`): the
  ProxyZone for every spec and hook (`helpers/proxy-zone.ts`), zone.js change
  detection like the app, a root `<base href>`, and the isolation layer.
  Before it, `ng test` loads the polyfills of the `test` build configuration
  (`zone.js`, `reflect-metadata`), `zone.js/testing` and
  `@angular/localize/init`, and initializes TestBed
  (`errorOnUnknownElements`/`errorOnUnknownProperties`, destroy after each).
- `vitest.config.ts` (next to `angular.json`) — random order, required
  assertions, 10 s timeout, spy restoring, coverage floors, and the plugin that
  lowers `async`/`await` in dependencies so `fakeAsync` controls them.
- `helpers/` — explicit infrastructure doubles: `config.ts` (PRERENDER/AppConfig,
  stored authorization), `socket.ts` (`SocketDouble` for ngx-socket-io),
  `isolation.ts` (global guards), `console.ts` (`expectConsoleError`),
  `component.ts` (`componentOf`: find a component by input value),
  `proxy-zone.ts` (runs specs in a zone.js ProxyZone, as zone.js does for Jasmine).
- `fixtures/` — `plain.ts` wire payloads and `runtime-config.ts`, both free of
  Angular/test-runner imports so the browser suite can share them; `models.ts`
  typed factories converting those payloads through the production
  `toInstance`.
- `unit/`, `components/` — specs (`*.spec.ts`).
- `browser/` — Playwright specs and fixture servers.

## Isolation rules (enforced by `helpers/isolation.ts`)

Before every spec: `localStorage`, `sessionStorage` and cookies are cleared and
`PRERENDER` is reset to `testRuntimeConfig()` (captcha, assistant and
OAuth off, dummy base URL). After every spec the spec **fails** if it:

- issued an application `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`
  request (the Vitest runner loads modules with `import()`, so no request is
  allowed) —
  use `provideHttpClientTesting()` + `HttpTestingController` (and call
  `verify()`), and `provideSocketDouble()` for sockets;
- left elements attached to `<body>` after TestBed teardown;
- logged a `console.error` it did not declare with
  `expectConsoleError(pattern)` from `helpers/console.ts`, or declared one that
  was never logged. A string pattern matches a substring of the joined
  arguments (an `Error` contributes its message), a RegExp is tested against
  it, and one declaration covers repeats. `HttpService` logs every HTTP error
  as `Process HTTP error <status> <body>`, so error-path specs declare it.

`fakeAsync` already fails a spec that leaves timers queued. Vitest runs specs
in random order, fails specs without assertions and restores `vi.spyOn` spies
after every spec (`vitest.config.ts`).

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

## Taiga controls in specs

Helpers in `helpers/taiga.ts`; app-side gotchas in `docs/taiga-ui-notes.md`.

- A native `select[tuiSelect]` logs NG0303 for `readOnly` under TestBed:
  pass `{ nativeSelect: true }` to `configureAppTestingModule`, or call
  `expectNativeSelectReadOnly()` with `errorOnUnknownProperties: false`.
  Drive it with `selectByLabel`, read it with `selectedLabel`/`optionLabels`.
- `input[tuiInputChip]` reads typing only while focused: add chips with
  `typeChip`, read them with `chipLabels`. The focused input leaves Taiga
  timers running, so call `fixture.destroy()` before `finish()`.
- `markedInvalid(input)` tells whether a `tui-textfield` shows its input as
  invalid (its `[invalid]` binding is true).
- Read a `<tui-error>`'s message with `fieldError` (empty until the control
  is touched and invalid). Specs that render a form outside `AppModule` need
  `provideValidationErrors()` for the app's messages.
- `togglePassword` clicks a password field's eye icon; check the input's
  `type` to see whether the value is shown.
- Drive a `<tui-segmented>` with `pickSegment(segmented, label)`; read it with
  `segmentLabels` and `activeSegment` (Taiga marks the active item with
  `.tui-segmented_active`).
- A textfield dropdown (`*tuiDropdown`) renders in `<tui-root>`'s portal:
  render the component inside a host whose template wraps it in
  `<tui-root>` (declare the host in `AppModule` with `TestBed.overrideModule`)
  and read options from `document`. Clicking an editable input doesn't open
  it; focus the input and dispatch ArrowDown. Blur the input before
  `fixture.destroy()`: an open dropdown at teardown leaves an iframe in
  `<body>`. See `tests/components/edit-input.spec.ts`.
- A `<tui-segmented [activeItemIndex]>` whose items come from an `@for`
  marks the active item only after its ResizeObserver fires: await two
  animation frames before reading `activeSegment` (see
  `select-theme.spec.ts`). Radios bound to a form control are marked at once.
- `isLoading(button)` tells whether a `tuiButton` shows its `[loading]` state
  (Taiga sets `aria-disabled`; it has no `.busy` class).
- Read a `<tui-tabs>` with `tabLabels` and `activeTab`; with `routerLink` +
  `routerLinkActive` tabs, the active one follows the route after navigation.
- A `button[tuiTab]` activates through Taiga's `tui-tab-activate.stop`
  event, which needs the event plugins from `provideTaiga()`. A spec that
  builds its own module instead of the app's must provide it, or clicks on
  tabs do nothing.
- Taiga dialogs render in the portal of a `tui-root`. A spec with its own
  module creates one with `popupRoot()` after the component (each
  `TestBed.createComponent` removes earlier root elements), provides
  `provideTaiga()`, runs `root.detectChanges()` with the fixture's, and reads
  the dialog with `openDialog()`. A closed dialog stays in the DOM during its
  leave animation: assert closing on the component's state.
- `tests/components/taiga-forms.spec.ts` shows these on a test-only form.

## Wire contracts

`fixtures/plain.ts` documents the backend source of every payload (patch route
and response, DataError bodies, node/launch events, rooms). Notable facts:

- Revision conflicts are HTTP **400** with a text body (backend `DataError`),
  not 409. Errors with details are `{ message, details }`.
- Node events are `{ launch, node }`; there is no `event` field on the wire.
- Socket rooms are joined/left with the room **name** (`backend/sockets.ts`),
  built with `src/consts/rooms.ts` (`user:<id>`, `launch:<id>`, `packages`). The
  socket connects only while signed in, with `auth: { token }`; the browser
  fixture server refuses a handshake without a known token.
- Artefact `data.type` is the class-transformer discriminator.

## Browser workflows (`tests/browser/`)

- `support/server.ts` serves `dist-browser/en` on `127.0.0.1` (random
  port, SPA fallback) and replaces the HTML's `PRERENDER = {};` in
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

## Troubleshooting

- `Executable doesn't exist` from Playwright (fast suites or browser
  workflows): `npx playwright install chromium` (add `--with-deps` on fresh
  Linux hosts).
- `Application bundle generation failed`: a compile error in a spec, printed
  before Vitest starts.
- `Expected to be running in 'ProxyZone'`: the spec runs outside the wrapped
  `it`/`beforeEach` globals, e.g. in a callback Vitest calls directly; move it
  into a spec or hook.
- Failure screenshots of the fast suites land in `.vitest/attachments/`.
