# Frontend testing implementation plan

Prepared: 2026-10-20. Implementation started 2026-10-20; see the status table.

This document is the implementation handoff and sole task-status index. It follows
the repository's [backend testing plan](backend-testing-plan.md) convention:
architecture, ordered task briefs, acceptance criteria, and evidence live together.
Commands and files become available as their task is marked DONE; see each
completion record.

## Objective and scope

Protect the frontend behaviors most likely to lose a user's work or prevent a
pipeline from running: model conversion, graph editing, autosave, navigation,
authentication, launch forms, live results, and deployment controls.

The first useful milestone is T001–T004: a repeatable harness with tests for data
contracts, persistence, HTTP, and navigation. The complete initial suite adds
component interactions, browser workflows, and required CI checks through T008.
Tests should verify observable behavior and failure recovery, not just component
construction, implementation call counts, or large snapshots.

Confirmed requirement: prepare and save a plan for later implementation by other
agents. The runner choices, test layout, milestones, and coverage policy below
are proposed defaults. Implementers may resolve ordinary setup choices without
another approval round, recording decisions and evidence here.

Out of scope for this first suite:

- Angular upgrades, a general application refactor, and changes to UI-kit itself.
- Exhaustive tests of administration, billing reports, assets, package management,
  assistant integrations, every pipe, or every translation.
- Pixel snapshots, performance budgets, a full mobile/cross-browser matrix, real
  OAuth/captcha/payment calls, and running AI providers.
- A browser-to-production-backend end-to-end stack. Browser fixtures exercise the
  real frontend with controlled HTTP/socket peers. Existing backend integration
  tests remain separate; together these suites do not prove full-stack wiring.

## Inspected baseline

- [frontend/package.json](../frontend/package.json) and its lockfile use Angular
  17.3, TypeScript 5.4, RxJS 7.8, Zone.js 0.14, and class-transformer. There are no
  frontend test scripts or application specs.
- [angular.json](../frontend/angular.json) has build/serve/extract-i18n targets
  and `skipTests` defaults, but no test target. The application uses NgModules,
  external HTML/SCSS templates, `src/...` imports, and localized builds.
- [tsconfig.json](../frontend/tsconfig.json) enables legacy decorators and emitted
  metadata. [main.ts](../frontend/src/main.ts) imports reflect-metadata.
- [AppModule](../frontend/src/app/app.module.ts) imports Monaco, JSON-editor
  consumers, hCaptcha, UI-kit, and a Socket.IO client connecting to `/` over
  WebSocket. Importing the whole application in every test would complicate
  isolation.
- [index.html](../frontend/src/index.html) declares `const PRERENDER = {}` and
  writes it to localStorage. The [config factory](../frontend/src/providers/app-config.ts)
  reads that lexical binding, while AppConfig and MeManager read localStorage
  during construction. Setting only `window.PRERENDER` before navigation will not
  override the page's lexical constant.
- [ProjectManager](../frontend/src/services/project.manager.ts) sanitizes graph
  references, transforms cached outputs, debounces changes, generates
  jsondiffpatch deltas, and tracks server revisions. Its state gates navigation
  and launches.
- [HttpService](../frontend/src/services/http.service.ts) adds authorization and
  maps HTTP errors; guards/resolvers coordinate route data and persistence.
- [LiveService](../frontend/src/services/live.service.ts) shares socket rooms;
  node/result components react to launch/node events and issue follow-up reads.
- [build.yml](../.github/workflows/build.yml) gates image building on backend
  tests only. [Makefile](../Makefile) also runs backend tests only. The
  [Dockerfile](../devops/docker/Dockerfile) builds the frontend with Node 22.
- `frontend/src/ui-kit` is a submodule: test Piper's use of its public behavior,
  keep fixtures/helpers in Piper, and do not silently change its revision.

This baseline comes from source inspection. No frontend install, build, test, or
browser run was performed while preparing this plan.

## Test architecture

### Runner and runtime decisions

Use **Jasmine + Karma + headless Chromium through Angular CLI 17's test builder**
for unit/service/component tests. This uses the application's compiler for
templates, decorators, DI, and Zone-based async testing. Angular 17 documents
[this test stack](https://github.com/angular/angular/blob/17.3.12/aio/content/guide/testing.md)
and [HTTP testing](https://github.com/angular/angular/blob/17.3.12/aio/content/guide/http-test-requests.md).
Backend Vitest usage does not establish Angular compiler compatibility. Do not
introduce a second fast runner merely to match the backend.

Use **Playwright Test with Chromium** for browser workflows against a local,
localized application build. Playwright supports
[HTTP response fixtures](https://playwright.dev/docs/mock); use those at the
transport boundary while retaining real UI interactions.

T001 must pin compatible dependencies and prove the setup. Node 22 matches this
repository's build environment, but Angular 17.3's historical matrix lists Node
18/20 and TypeScript `>=5.2 <5.5`, and Angular 17 is now outside support.
See the [official compatibility table](https://angular.dev/reference/versions).
Start by testing the existing Node 22 build environment and record any deviation
from the matrix explicitly. Do not describe it as officially supported, silently
switch CI to an obsolete runtime, or fold a framework upgrade into this work.
If the harness cannot work on the existing environment without a substantial
migration, document the concrete failure and separate prerequisite decision.

### Proposed layout and commands

Keep all tests under `frontend/tests/`:

- `setup.ts`: browser globals, localization/metadata setup, isolation checks.
- `helpers/`: explicit factories for socket, config, route, and heavyweight UI
  boundaries; no automatic blanket mocking.
- `fixtures/`: small JSON wire payloads and fresh typed fixture factories.
- `unit/`: models, utilities/pipes with domain rules, services, guards, resolvers.
- `components/`: real-template TestBed fixtures and host components for directives.
- `browser/`: Playwright specs, stateful HTTP fixtures, and local fixture-server
  support for static files and Socket.IO.
- `README.md`: runtime prerequisites, commands, fixture ownership, mocking rules,
  troubleshooting, and the distinction between fixture and full-stack tests.

Configure discovery explicitly because Angular's default source root is `src`.
Keep Jasmine and Playwright globals/types in separate TypeScript configurations;
exclude both suites from application bundles. Prefer one shared Chromium install
if compatible, otherwise document separate browser provisioning.

Proposed scripts, to be created by T001/T007:

| Command in `frontend/`   | Contract                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `npm test`               | Unit and component suites, headless, single run, no Docker                                          |
| `npm run test:watch`     | Local watch mode                                                                                    |
| `npm run test:typecheck` | Check all test/helper/config TypeScript; later include browser tests without global-type collisions |
| `npm run test:coverage`  | Single run with text, HTML and machine-readable coverage                                            |
| `npm run test:browser`   | Build/serve the controlled browser target, execute Chromium workflows, stop owned processes         |

Angular test compilation must check the templates exercised by component tests;
TypeScript checks alone are insufficient. T008 adds `make test-frontend` and
`make test-frontend-browser`, and makes `make test` include the fast frontend
suite after backend checks. Keep Docker and browser workflow tests explicit.

### Isolation and fidelity rules

1. Keep model decorators, `toInstance`/`toPlain`, jsondiffpatch, YAML parsing,
   forms, and domain transformations real. Construct typed models from plain
   fixtures instead of bypassing nested Maps/Dates with casts.
2. Use TestBed and HttpClientTestingModule/HttpTestingController for HttpService
   tests, verifying pending requests after every test. Components can use typed
   HttpService doubles; include selected tests integrating the real service.
3. Install controlled PRERENDER/localStorage state before constructing providers.
   Reset authorization, user, project form storage, cookies where used, and
   globals between cases. Fixtures contain fake tokens and dummy environment
   values only.
4. Use a controllable socket double exposing `emit` and `fromEvent`; every test
   gets fresh Subjects, room state, and subscriptions. No real socket connection
   from unit/component suites.
5. Compile real templates for component interaction tests. Stub Monaco,
   hCaptcha, and JSON-editor boundaries with explicit inputs/outputs and form
   control behavior where needed. Avoid blanket `NO_ERRORS_SCHEMA`, replacing the
   tested template, or mocking all child components to make compilation pass.
   Cover a real Monaco/YAML interaction in the browser suite.
6. Use Angular `fakeAsync`/`tick` for debounce/UI delays, or RxJS TestScheduler
   for isolated stream behavior. Do not mix competing fake clocks within a test.
   Tests destroy fixtures, unsubscribe, and prove pending work is cleaned up.
7. Unit/component tests reject unexpected application HTTP/fetch/WebSocket traffic
   while permitting runner transport and required local assets. Browser tests
   allow only their loopback fixture origin and registered fixtures. Handle
   external fonts deterministically; disable actual captcha/OAuth/assistant
   integrations in test config.
8. Use preparation, action, and assertions separated by blank lines. Prefer
   semantic DOM queries and stable node/input identifiers; add small `data-testid`
   attributes only where accessible names cannot identify canvas controls.
9. Do not assert accidental behavior as the product contract. Reproduce suspected
   bugs against intended behavior; a narrow regression fix may accompany its
   test in a later implementation task. Record ambiguous behavior or broader
   fixes as explicit blockers/follow-ups rather than weakening or skipping tests.

### Shared fixtures and contracts

T002 establishes these contracts before dependent agents add scenarios:

| Fixture               | Required content and assertions                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project A / Project B | Distinct `_id`, owner and revision; minimal valid pipelines; independent nested objects; never share mutable Maps                                                  |
| Small graph           | Two nodes with scalar ports, pipeline input/output flows, start nodes and arrange coordinates; variants add JSON/image transformers                                |
| Serialization         | Wire maps are keyed JSON objects; frontend representations are real Maps and class instances; dates round-trip as appropriate                                      |
| Launch request        | `inputs`, per-node `inputs`/`outputs`, `options.bucket`, and `inclusive.nodes`; distinguish absent, null, false, zero and empty string                             |
| Patch sequence        | `PATCH /api/projects/:id/patch/:revision` with actual jsondiffpatch deltas; response includes a new revision; verify by applying deltas to a separate old snapshot |
| Revision failure      | Use the current backend DataError response (HTTP 400), not an assumed 409; source: [patch-project.ts](../backend/api/projects/patch-project.ts)                    |
| Authentication        | Fake authorization token/user, anonymous and owner/engineer/admin cases; verify headers, storage and UI permissions separately from backend authorization          |
| Launch and events     | Typed launch/output data plus `launch`, `node`, `event` fields for PipelineEvent; inspect each specialized event model rather than inventing a universal payload   |
| Room lifecycle        | `join_room`/`leave_room` carry the room name, matching [backend/sockets.ts](../backend/sockets.ts); multiple subscribers share one room                            |
| Runtime flags         | Billing on/off, signup enabled/disabled, dummy base URL, captcha/assistant off by default; explicit variants override only relevant fields                         |

Use the checked-in compiled schemas when validating graph fixtures. Do not import
backend application modules (which can connect to infrastructure) into frontend
tests. Cite backend handlers or existing backend contract fixtures as sources
for wire examples, especially node input/output/status paths. Fixture responses
must not conceal a frontend/backend route mismatch.

### Candidate regressions found during inspection

These are leads for implementation agents, not verified runtime findings:

- T003: output cleanup in `ProjectManager.sanitize` deletes from
  `nodeToLaunch.inputs` when an output is missing; test with missing inputs too.
- T003: edits arriving while a save is pending can interact with the `saving`
  early return; also test a late response after switching projects.
- T005: `addNodeFlow` compares `i.type !== i.type` in its scalar branch.
- T005/T006: truthiness defaults in `addInput` and playground `build/reset` can
  discard explicit `false`, `0`, or `""`.
- T006: `LiveService` emits the subscription ID on `leave_room`, while the server
  expects a room name. Inspect repeated release, user reload, and component
  destruction for retained subscriptions.
- T005: YAML/JSON parsing can throw without a visible validation message.

## Implementation tasks and agent handoff

The table below is the only status authority. New tasks are all TODO. Acceptance
checkboxes and completion records belong in their task sections.

| ID   | Task                                                                                             | Dependencies | Status                 |
| ---- | ------------------------------------------------------------------------------------------------ | ------------ | ---------------------- |
| T001 | [Establish the Angular test harness](#t001--establish-the-angular-test-harness)                  | None         | DONE                   |
| T002 | [Freeze fixtures and model contracts](#t002--freeze-fixtures-and-model-contracts)                | T001         | DONE                   |
| T003 | [Protect autosave and graph sanitation](#t003--protect-autosave-and-graph-sanitation)            | T002         | DONE                   |
| T004 | [Cover HTTP, session and routing](#t004--cover-http-session-and-routing)                         | T002         | DONE                   |
| T005 | [Test editing and canvas interactions](#t005--test-editing-and-canvas-interactions)              | T003, T004   | DONE                   |
| T006 | [Test launches, live state and deployment UI](#t006--test-launches-live-state-and-deployment-ui) | T005         | DONE                   |
| T007 | [Add browser workflow coverage](#t007--add-browser-workflow-coverage)                            | T006         | DONE                   |
| T008 | [Gate CI and finish documentation](#t008--gate-ci-and-finish-documentation)                      | T001–T007    | BLOCKED (first CI run) |

Execution rules:

1. Read AGENTS.md, this plan, the assigned task, and prerequisite completion
   records. Select the lowest ready TODO or resume the assigned task.
2. Change its table status to IN_PROGRESS; preserve unrelated changes.
3. Complete only the assigned task and necessary narrow dependency fixes. Record
   new compatibility decisions in the relevant section.
4. Check acceptance using actual command results. Add changed files, test counts,
   runtime/browser versions, decisions, limitations, and next ready task to the
   completion record. Do not claim commands that were not run.
5. Mark DONE only when acceptance passes. Use BLOCKED with a concrete cause when
   the task cannot be completed; no silent skipped regressions.

T003 and T004 can run independently after T002. Their service ownership is
separate; coordinate fixture changes through the T002 contracts. T005 and T006
are sequential because both touch the visual editor. Package/config edits belong
to T001 until complete, browser setup to T007, and final Makefile/workflow edits
to T008. Each agent owns its tests and any tightly scoped fixes in the listed
source areas. This schedule does not launch implementation agents.

### T001 — Establish the Angular test harness

**Outcome:** one command runs real Angular tests reliably without application
infrastructure.

**Ownership:** frontend package/lockfile, angular test target, test TypeScript and
runner configuration, setup/helpers, harness specs, initial tests README and
test-specific lint/ignore configuration.

**Work:**

- Verify Node 22 and current Angular/TypeScript dependencies; pin runner/browser
  dependencies and document the compatibility outcome. Keep runtime upgrades out
  of scope.
- Add the proposed fast-suite scripts and explicit test discovery. Initialize
  localization, reflect-metadata and Zone testing in the required order.
- Prove DI, `src/...` imports, JSON schema imports, decorated nested model
  conversion, an existing external-template component, and a timed Observable.
- Provide an initial explicit HTTP/socket/config boundary and isolation check.
  Reset TestBed/storage/globals and prevent real application network traffic.
- Establish targeted linting without sweeping existing frontend lint cleanup.

**Acceptance:**

- [x] A clean install with documented browser prerequisites can run typecheck,
      fast tests, coverage and targeted lint without backend services or Docker.
- [x] Real templates and nested model transformations execute successfully.
- [x] A deliberately unexpected application request fails the harness; timer or
      fixture leaks do not silently pass.
- [x] Tests are absent from production bundles; application build still works.

**Verification:** run the new commands and one application build; record exact
runtime, browser and dependency versions. Demonstrate watch mode once. A harness
smoke test is useful here, but do not add an empty creation test for every class.

**Completion record (2026-10-20, DONE):**

- Runtime: Node 26.12.0 / npm 11.20.0 on macOS (the only Node installed
  locally; Node 22 not available on this machine). Angular 17.3.2, CLI 17.3.2,
  TypeScript 5.4.5, RxJS 7.8.1, Zone.js 0.14.4. Browser: Google Chrome
  155.0.8059.85 headless. Node 22+ is outside Angular 17.3's published matrix
  (18/20); it works for build and tests here but is a recorded deviation, not
  official support. CI verification on Node 22 belongs to T008.
- Pre-existing environment issue: the local `node_modules` was stale (missing
  `ng-hcaptcha`), so `ng build` failed before any change; `npm ci` fixed it.
- Added exact-pinned dev deps: karma 6.4.4, karma-chrome-launcher 3.2.0,
  karma-coverage 2.2.1, karma-jasmine 5.1.0, karma-jasmine-html-reporter 2.1.0,
  jasmine-core 5.1.2, @types/jasmine 5.1.4. Decision: an npm `overrides` entry
  makes karma-jasmine use the root jasmine-core 5.1.2 instead of its nested 4.x,
  so the typed and executed Jasmine versions match.
- Files: `frontend/angular.json` (`test` target: `tests/setup.ts` main;
  polyfills zone.js, zone.js/testing, @angular/localize/init; explicit
  `../tests/unit` and `../tests/components` discovery relative to `src`;
  coverage excludes ui-kit/schemas/locale/tests), `karma.conf.cjs` (random
  order, fail specs without expectations, ChromeHeadlessCI `--no-sandbox`,
  html/lcov/json-summary/text-summary coverage), `tsconfig.spec.json`,
  `eslint.config.mjs` (CommonJS globals for `*.cjs` only), `package.json`
  scripts `test`, `test:watch`, `test:typecheck`, `test:coverage`, `lint:tests`,
  `tests/setup.ts`, `tests/helpers/{isolation,config,socket}.ts`,
  `tests/unit/harness.spec.ts`, `tests/README.md`.
- Isolation decisions: storage/cookies/PRERENDER reset before every spec;
  application fetch/XHR/WebSocket/EventSource traffic fails the spec; elements
  left on `<body>` after TestBed teardown fail the spec; TestBed uses
  `errorOnUnknownElements`/`errorOnUnknownProperties`. The `PRERENDER` lexical
  constant is emulated by a `globalThis.PRERENDER` set before AppConfig is built.
- Evidence: `npm run test:typecheck` clean; `npm test` 13/13 harness specs;
  a temporary negative spec (removed) produced the expected three failures:
  "Unexpected XMLHttpRequest GET request to /api/me", "Spec left 1 element(s)
  attached to <body>: aside", "1 timer(s) still in the queue";
  `npm run test:coverage` wrote `coverage/` (html, lcov.info,
  coverage-summary.json); `npm run lint:tests` and Prettier clean; watch mode
  re-ran (13 SUCCESS twice) after a spec edit; `ng build --localize` succeeded
  for all 13 locales and no test identifiers (`SocketDouble`,
  `installIsolation`, `jasmine`) appear in `dist/`. Filtered run
  `npx ng test --watch=false --include=../tests/unit/models` verified.
- Limitations: Node 22 runtime not exercised locally (see above).
- Next ready task: T002 (done below); then T003/T004.

### T002 — Freeze fixtures and model contracts

**Outcome:** later tests share realistic, independent data without duplicating
model conversion or backend semantics.

**Ownership:** `tests/fixtures`, fixture helpers, model/utility/pipe contract
specs, fixture documentation.

**Work:**

- Implement the shared fixture table. Cross-check critical URLs/payloads against
  backend handlers and JSON schemas, recording source paths.
- Test Project/Pipeline/Node/LaunchRequest/Launch and event conversion: nested
  Maps, class instances, Dates, unknown/unexposed properties, empty collections,
  missing optional values, and explicit falsy values.
- Test environment-schema generation and selected domain pipes such as
  permissions and flow lookup where they affect core workflows. Do not exhaust
  trivial wrappers just to raise coverage.
- Return fresh models for each test and share plain fixture data with browser
  tests without introducing Jasmine dependencies there.

**Acceptance:**

- [x] Fixtures round-trip through real transformations and valid graph fixtures
      validate against checked-in schemas.
- [x] Mutating Project A never changes another fixture or Project B.
- [x] Wire patch/error/event contracts are documented with repository sources.

**Verification:** focused contract suite, fast-suite typecheck and lint. Assert
representative field values/types, not only equality of two calls to the same
conversion function.

**Completion record (2026-10-20, DONE):**

- Files: `tests/fixtures/plain.ts` (Project A/B, small graph with JSON and
  image-array transformer variants, launch request with distinct falsy values,
  patch URL/response, revision conflict and schema-invalid 400 bodies, launch,
  node/`set_output`/`set_errors` events, room event names — each with its
  backend source path), `tests/fixtures/runtime-config.ts` (runtime flags and
  variants, shared with browser tests), `tests/fixtures/models.ts` (typed
  factories through production `toInstance`),
  `tests/unit/models/fixtures.contract.spec.ts`,
  `tests/unit/pipes/domain-pipes.spec.ts` (environment schema generation,
  `CanPipe` owner/role matrix, flow lookup and output index).
- Regressions found and fixed narrowly, each with a failing test first:
  1. `src/models/launch.ts`: `FloatData` was registered under discriminator
     `"integer"` (backend: `"float"`), so float artefacts deserialized as bare
     `OutputData` and lost their value.
  2. `src/models/launch.ts`: `JsonData.value` used `@Type(() => Object)`, which
     with `excludeExtraneousValues` stripped every key, so JSON outputs rendered
     as `{}`; now uses `objectTransformer` like the backend.
  3. `src/pipes/can.ts`: a second `transform` without an owner threw
     `Cannot read properties of null (reading '_id')`.
- Contract drift recorded (not fixed; schema change is outside T002): the
  checked-in `launchRequest` JSON schema declares `options.saveArtefacts`, while
  frontend and backend models use `options.bucket`; the schema also has
  `additionalProperties: false`, so a request with `bucket` fails that schema.
  Node events on the wire carry `{ launch, node }` only; frontend
  `PipelineEvent.event` stays undefined.
- Evidence: contract + pipe suites 35 specs; full fast suite 48/48 SUCCESS;
  `npm run test:typecheck` and `npm run lint:tests` clean. Frontend and backend
  `compiled.json` were byte-identical when checked.
- Next ready tasks: T003 and T004 (parallel).

### T003 — Protect autosave and graph sanitation

**Outcome:** edits persist accurately and late or failed saves cannot silently
discard work.

**Ownership:** ProjectManager tests and narrow fixes in
`src/services/project.manager.ts`; source extraction only if necessary for a
clear test boundary.

**Work:**

- Drive the public `project`, `markDirty`, `kick`, `status`, `updates` and `error`
  interfaces with a controlled clock and HTTP responses.
- Cover unchanged projects, debounce coalescing, immediate kick, pipeline/request/
  environment deltas, revision advancement and status/error transitions.
- Apply emitted deltas to an independent baseline and compare the reconstructed
  project with the intended edit. Avoid asserting incidental delta formatting.
- Cover a failed request and explicit retry, revision conflict, edits during an
  in-flight save, and switching/clearing a project before the old response arrives.
  Required outcome: edits remain recoverable and responses cannot modify another
  project's revision/snapshot.
- Exercise sanitation: missing start nodes, orphan node/input/output flows,
  non-featured inputs, deleted ports, default overrides, empty launch nodes,
  JSON path conversions, malformed JSON, image-array boundaries and falsy values.

**Acceptance:**

- [x] Saved snapshots/revisions advance only for successful matching saves.
- [x] No-op updates send no patch; rapid edits produce the intended saved state.
- [x] Failed/conflicting/pending saves do not lose later edits or corrupt another
      project.
- [x] Sanitization removes invalid references while preserving valid outputs,
      inputs and explicit falsy values.

**Verification:** focused ProjectManager suite using virtual time and controlled
response ordering, then all fast tests and typecheck. Add regression tests before
any narrow production fix; record unresolved product behavior explicitly.

**Completion record (2026-10-20, DONE):**

- Files: `tests/helpers/project-manager.ts` (real HttpService + ProjectManager
  TestBed, debounce constants, `expectPatch`),
  `tests/unit/services/project-manager.autosave.spec.ts` (14 specs),
  `tests/unit/services/project-manager.sanitize.spec.ts` (49 specs);
  `src/services/project.manager.ts` (+39/−7).
- Regressions fixed narrowly, each with a spec that fails without it (the two
  sanitize fixes were confirmed by temporarily reverting them: 3 failures):
  1. Sanitize removed `nodeToLaunch.inputs[id]` when an _output_ port was
     deleted (stale output kept, unrelated input lost, crash when `inputs`
     undefined); now deletes from `outputs`.
  2. Pipeline output flows to a deleted output port survived; now checked.
  3. Edits during an in-flight save were dropped (`saving` early return), and
     `markDirty` overwrote `saving` so a second PATCH used the stale revision;
     a pending re-save now runs after success with the new revision.
  4. A response arriving after newer edits reported `saved`; it stays `dirty`.
  5. A late response after switching projects wrote Project A's revision and
     snapshots into Project B; stale responses/errors are ignored.
  6. Clearing the project before a pending autosave crashed; now a no-op.
- Follow-ups (product decisions, not fixed): revision conflicts are not
  recoverable (retry conflicts again; no reload/merge); after switching
  projects mid-save the status stays `saving` until the new project's next
  save; `launchRequest.inputs` without a pipeline input are not removed
  (existing TODO). class-transformer drops Map keys that collide with
  `Map.prototype` members (`size`, `get`, `keys`, …), so ports with those names
  are lost on conversion; the T002 fixture port was renamed and a contract spec
  records the behaviour.
- Evidence: `npm run test:typecheck` clean; `npm test` 145/145 SUCCESS at
  completion (63 in this task); ESLint clean on the task's files.

### T004 — Cover HTTP, session and routing

**Outcome:** requests use the right contracts and navigation respects session
and save state.

**Ownership:** HttpService, AppConfig/config factory, guards, resolvers,
`projectIdMatcher`, and login/signup component tests. MeManager room lifecycle
belongs to T006.

**Work:**

- Test every HTTP verb, relative/absolute URL construction, token/custom headers,
  query parameters, JSON/text/FormData bodies and response extraction.
- Cover status 0, 400, 401, 404, 413, 429, 499, 500 and other server errors;
  assert error classes/data. A 401 clears authorization and redirects.
- Test config initialization/storage and sign-in success/failure with real forms,
  disabled/invalid submission states, progress reset and configured signup/
  captcha feature gates. Stub the captcha provider.
- Test anonymous/sign-in guards, first-readme state per project, and project
  matcher behavior for `/projects/import` versus project IDs.
- Test SaveProjectGuard with real ProjectManager: kicks saving, permits navigation
  only after success, retains the project on error, and handles retries without
  premature navigation. Validate a visible save-error state with ProjectComponent.
- Test project/launch/node/deploy resolvers with realistic route snapshots,
  missing IDs/optional parameters, typed payloads, and HTTP failures; use a small
  real Router test for resolver/guard integration and named outlet navigation.

**Acceptance:**

- [x] All HTTP assertions use HttpTestingController and leave no pending request.
- [x] Failed login does not persist credentials; 401 clears authorization state.
- [x] Unsaved/failed edits cannot silently disappear through navigation.
- [x] Route matching/resolution and owner/role UI checks use realistic models.

**Verification:** focused HTTP/session/router suites, then all fast tests and
typecheck. Do not treat hidden frontend controls as proof of backend authorization.

**Completion record (2026-10-20, DONE):**

- Files (57 specs): `tests/unit/services/http.service.spec.ts` (20),
  `tests/unit/providers/app-config.spec.ts` (7), `tests/unit/guards/guards.spec.ts`
  (9), `tests/unit/resolvers/resolvers.spec.ts` (9),
  `tests/unit/routing/project-routing.spec.ts` (6),
  `tests/components/login.component.spec.ts` (5),
  `tests/components/project-save-error.spec.ts` (1), `tests/helpers/jit.ts`.
- Fix: `src/guards/save-project.guard.ts` allowed navigation when an
  already-running autosave finished, dropping an edit made during it (the
  project was then cleared); it now saves again before permitting navigation.
- Coverage: all HTTP verbs, relative/absolute URLs, params, token and custom
  headers, JSON/text/FormData bodies, text responses; status 0, 400 (text and
  details bodies), 401 (clears authorization, redirects), 403 (unmapped), 404,
  413, 429, 499, 500, 503. Config factory with PRERENDER, variants, localStorage
  fallback and defaults. Anonymous/sign-in/readme guards; SaveProjectGuard with
  real ProjectManager (no-op, wait for success, failure blocks navigation and
  keeps the project, retry). Project/launch/node/deploy resolvers incl. missing
  IDs, 404 and optional prefix. `projectIdMatcher` incl. `/projects/import`;
  real Router named `right` outlet resolution and navigation held until saved.
  Login with real template: invalid submit, success, failure (no credentials
  stored, error visible, progress reset), signup/OAuth gates. ProjectComponent
  shows and dismisses a revision-conflict error and retries.
- Decision: `UiKitModule` cannot be imported under the JIT test compiler —
  pipes extending `UntilDestroyed` fail with "Directive X has no selector";
  production AOT builds are unaffected. `asJitPipes(...)` in `tests/helpers/jit.ts`
  works around it for component specs.
- Follow-ups: HttpService sends a bogus `contentType` header (HttpClient still
  sets the real Content-Type; the bogus key is not asserted as contract); the
  signup page always renders `ng-hcaptcha` even when captcha is not required
  (no signup spec yet); `CanPipe` opens an unclosed `user$` subscription on every
  transform.
- Note: unexplained working-tree edits inverting `SigninNeededGuard` and
  `ImageProxyPipe` (`!!x` → `!x`) appeared during this work and were reverted
  outside the agents; the guard specs failed while they were present.
- Evidence: `npm run test:typecheck` and `npm run lint:tests` clean; T004 suites
  alone `TOTAL: 57 SUCCESS`; full run at that moment 146 passed / 29 failed, all
  failures in T005's in-progress editor specs.

### T005 — Test editing and canvas interactions

**Outcome:** editing through the UI creates a valid graph and persists the
intended changes.

**Ownership:** visual editor editing methods/templates, node/input/flow editors,
YAML editor, drag/drop/zoom directives, corresponding component tests.

**Work:**

- Test adding/moving/removing nodes and pipeline inputs/outputs, first start-node
  assignment, unique generated IDs, and cleanup through real ProjectManager.
  Assert graph relationships rather than random ID strings.
- Cover accepted/rejected scalar connections, matching JSON schemas, supported
  JSON/image transformers, pipeline-input connections, remove/cancel actions and
  dirty-state signaling.
- Preserve default and explicit falsy values. Verify edits to one node/input do
  not mutate another.
- Test YAML/JSON editing: load existing data, valid round-trip, invalid syntax,
  and schema rejection at the actual validation/save boundary. Invalid edits
  must not partially replace the valid graph; errors should be visible.
- Use host fixtures for mouse drag delay/grid/zoom math, disabled/read-only
  behavior, form-control click exclusion, zoom bounds and listener/timer cleanup.
  Browser geometry itself is verified in T007.
- Exercise real template buttons/fields/outputs and route outlets; include at
  least one integrated edit-to-patch test. Keep heavy editor stubs faithful.

**Acceptance:**

- [x] Valid edits yield the expected graph and saved patch; rejected connections
      leave the graph unchanged.
- [x] Deletion leaves no stale flow/start/request references after sanitation.
- [x] Invalid YAML/JSON preserves valid state and exposes an actionable error.
- [x] Read-only modes cannot modify the graph through tested UI interactions.

**Verification:** component/directive suites with DOM events and fake time, all
fast tests/typecheck, and application compilation if templates or code changed.

**Completion record (2026-10-20, DONE):**

- Files (62 specs): `tests/components/edit-pipeline-visual.spec.ts` (28, incl.
  an integrated edit-to-PATCH test), `edit-pipeline-yaml.spec.ts` (6),
  `edit-pipeline-input.spec.ts` (7), `edit-flow-transformer.spec.ts` (3),
  `tests/unit/directives/canvas-directives.spec.ts` (18: drag-move, pitch-zoom,
  drag-clone, drop-zone — grid/zoom math, disabled, form-control clicks, zoom
  bounds, cleanup), `tests/helpers/editor.ts`, `tests/helpers/editor-stubs.ts`
  (Monaco stand-in with the same selector and form-control behaviour).
- Decision: the visual editor is tested with its real template by loading the
  full `AppModule` under the real `AppComponent` (popover/modal host); only HTTP,
  socket and drawer-outlet routes are replaced. YAML editing stubs only Monaco;
  real Monaco is left to T007.
- Regressions fixed narrowly, each with a failing spec first:
  1. `addNodeFlow` scalar branch compared `i.type !== i.type`, accepting any
     scalar connection (e.g. string → integer); now `o.type !== i.type`.
  2. `addInput` dropped `false`/`0`/`""` defaults (`if (value)`); now only
     `undefined`/`null` are skipped (the method currently has no callers).
  3. `removeNode` left the node's flows until sanitize ran, and the `node` pipe
     threw "Node … not found" while rendering; flows, input/output flows and
     start entries are now removed immediately.
  4. Invalid YAML/JSON threw an uncaught `YAMLParseError` with no message.
  5. Schema-invalid YAML replaced the pipeline/title before the server
     rejected it; `save()` now parses all tabs, validates against the pipeline
     schema and changes nothing on failure, showing an `<app-informer>` error
     (new i18n id `message.pipeline_schema_invalid`, not yet in locale files;
     `--localize=ru` still builds).
  6. `edit-pipeline-input` restored a stored `0`/`false` as the default
     (`stored || default`).
  7. `edit-pipeline-input` discarded typed `0`/`""` differing from the default.
- Follow-ups: move `asJitPipes()` registration into `tests/setup.ts` so future
  suites do not need it; NG0313 warning — two pipes are named `includes`; host
  `@HostListener("click")` on `selectNode` passes an undefined node (behaviour
  still correct); selectable directive and node-package editors not covered;
  translate `message.pipeline_schema_invalid`.
- Evidence: `npm run test:typecheck` and `npm run lint:tests` clean; `npm test`
  208/208 SUCCESS; `npx ng build --configuration development` OK.

### T006 — Test launches, live state and deployment UI

**Outcome:** users can submit a valid launch, see scoped updates, stop execution,
and operate deployment controls without stuck or stale UI state.

**Ownership:** visual editor run/interrupt methods, ProjectPlayground,
PlayWithProject, launch/node result components, LiveService/MeManager, DeployPipeline
and related tests.

**Work:**

- Test playground required/optional controls, stored input restoration/reset,
  zero/false/empty-string handling, project isolation, correct serialized launch
  requests and signals. Invalid forms do not submit through the UI.
- Test whole-pipeline and single-node runs: wait for saving, correct bucket and
  inclusive-node options, response conversion, progress cleanup and URL state.
  Save/launch failures remain visible; interrupt success/failure clears progress.
- Test room reference counting: one join for shared subscribers, leave with room
  name only after final release, independent rooms and safe repeated cleanup.
  Cover MeManager login/logout/user reload and balance refresh lifecycle.
- Drive node/pipeline events for matching and unrelated launch/node IDs. Assert
  status, outputs/log refreshes and errors; destroy/recreate fixtures and ensure
  stale events no longer trigger work. Include duplicate/late events.
- Cover empty results and representative text/JSON/image artefact rendering,
  selected output/index changes, and locally served image fixtures.
- Test deployment load/default config, save debounce, create/delete requests,
  list refresh, permissions, failure messages and progress reset. No real
  deployment or API execution is performed by tests.

**Acceptance:**

- [x] The launch payload preserves form values; no launch occurs before required
      saving succeeds.
- [x] Success, failure and interruption produce observable, correct UI state.
- [x] Unrelated/stale events do not update the current launch or retain rooms.
- [x] Deployment operations use expected contracts and recover from errors.

**Verification:** component/service suites with real models and explicit event
Subjects, all fast tests/typecheck. Keep a socket double at the boundary; T007
checks real Socket.IO transport against a fixture peer.

**Completion record (2026-10-20, DONE):**

- Files (73 specs): `tests/unit/services/live-me.spec.ts` (11),
  `tests/components/editor-run.spec.ts` (10), `project-playground.spec.ts` (12),
  `launch-results.spec.ts` (22), `launches.spec.ts` (8),
  `deploy-pipeline.spec.ts` (10), `tests/fixtures/launch-results.ts` (backend
  sources cited), `tests/helpers/json-editor-stub.ts`.
- Regressions fixed narrowly, each with a failing spec first:
  1. `LiveService` emitted `leave_room` with the subscription id instead of the
     room name (server never left the room); repeated release could delete a
     newer subscriber's room. Release is idempotent and room-scoped.
  2. `MeManager` stacked a user-room reference on every user reload (each
     balance update), so logout never left the room.
  3. `EditPipelineVisualComponent` never released its user-room subscription.
  4. `NodeComponent` added a full set of socket listeners per launch
     (duplicate status reads).
  5. NodeOutputs/NodeState/NodeLogs/NodeJobs reacted to other launches' events
     for the same node id, stacked listeners (and rooms) on node change, and
     kept reloading after destroy.
  6. Playground restore/reset turned stored `false`/`0`/`""` into defaults
     (`||` → `??`); playground edits mutated the project's own launch request so
     reset restored the edits; the `window.play` hook leaked after destroy.
  7. PlayWithProject and Launches kept signal subscriptions after destroy.
  8. Launches dropped a `set_output` for an output the listed launch did not
     know yet.
  9. Deploy removal called `DELETE /api/deploys/<prefix>_<slug>` (owners could
     not delete; wrong backend cache key); now `/api/deploys/:prefix/:slug` or
     `/api/deploys/:slug`. Removal errors were never shown (`err.error`), and the
     error box rendered "Error: …" instead of the message. This also resolved
     the T007 `test.fail` owner-delete workflow, now a normal passing test.
- Follow-ups: LaunchesComponent reads `config.authorization._id` (absent, so the
  "by …" label never shows), stores errors as `err.error` without a template
  slot, and reads `me.user._id` on init (anonymous crash); NodeLogs/NodeJobs
  store `err.error` and show nothing; NodeComponent can schedule another 2 s
  status poll after `silent()`/destroy; whole-pipeline `run()` waits for an
  in-flight save but does not trigger one (spec pins waiting only); playground
  reset via the popover click is tested through `reset()`.
- Evidence: `npm run test:typecheck` and `npm run lint:tests` clean; `npm test`
  281/281 SUCCESS on two consecutive randomized runs; `ng build --configuration
development` OK.

### T007 — Add browser workflow coverage

**Outcome:** critical workflows work in a real browser with the application
router, templates, canvas geometry and editor integrations.

**Ownership:** Playwright config/scripts/types, `tests/browser`, local fixture
server, browser fixture contracts, minimal stable UI selectors.

**Work:**

- Build English and one additional locale (Russian is available) with the real
  Angular compiler. Serve the artifacts on loopback with SPA fallback and the
  correct `/en/` and `/ru/` base paths; do not require nginx or port 80.
- The fixture server replaces the HTML's `const PRERENDER` value in memory with
  controlled config before serving it. Assert replacement succeeds exactly once.
  Do not mutate the production HTML or rely solely on `addInitScript` assigning
  `window.PRERENDER`. Seed fake authorization/storage before app construction;
  do not reseed over state changed by a test on every reload.
- Implement a small stateful HTTP fixture per test. Validate methods, paths,
  payloads and revisions, apply real patches, and serve the resulting state on
  reload. Fail unhandled API requests rather than returning generic success.
- Provide a real local Socket.IO fixture peer for the app's WebSocket-only
  connection, using matching event/room contracts. Isolate sessions by browser/
  fixture identity, or run this small suite serially. No broad production
  test-only hooks or handcrafted partial Socket.IO wire protocol.
- Serve local assets; fulfill/block known external fonts; reject unexpected
  external traffic and unexpected browser exceptions. Treat intentionally
  exercised errors narrowly. Use a fresh browser context/state per case.
- Run these workflows through DOM actions:
  1. Anonymous protected-route redirect; sign in; invalid credentials remain on
     the form; reload preserves the successful session.
  2. Open fixture project, add/connect/move nodes, edit an input, await save,
     reload and verify saved graph/position/value. Also drag while zoomed.
  3. Edit YAML through real Monaco, show invalid input feedback, correct it, then
     return to the visual editor and verify the graph.
  4. Fail one save, display the error, retry, then navigate; verify persisted
     state and ordering from captured requests.
  5. Submit playground inputs, receive controlled running/output/completion
     events, view the result, and exercise launch failure/interruption.
  6. Create/delete a fixture deployment and verify list updates/error handling.
  7. Direct-load/reload a Russian route and navigate within its locale without
     falling back to an English base path.
- Wait for observable UI/network state rather than fixed sleeps. Capture traces
  and screenshots on failure; disable retries initially so flakes are visible.
  Give server/test steps finite timeouts and clean up owned processes on failure.

**Acceptance:**

- [x] Workflows use real interactions and persisted fixture state; no direct
      Angular component calls replace browser actions.
- [x] HTTP and Socket.IO fixture contracts match inspected backend handlers.
- [x] Locale paths, reloads, real canvas geometry and Monaco are exercised.
- [x] Three consecutive runs pass without retries, leftover servers, shared
      storage, unexpected requests or unexplained browser errors.

**Verification:** the new browser command plus test typecheck. Record commands,
browser/runtime versions, run durations and artifacts. Explicitly describe this
as frontend integration coverage with a fixture backend.

**Completion record (2026-10-20, DONE):** frontend integration coverage
against a fixture backend — not a full-stack test.

- Scheduling note: implemented in parallel with T005/T006 (file ownership was
  disjoint apart from a few `data-testid` attributes); it does not use T006
  component code.
- Files: `tests/browser/{playwright.config.ts,tsconfig.json}`,
  `tests/browser/support/{server,api,test}.ts`, specs `auth`, `canvas`, `yaml`,
  `save-retry`, `launch`, `deploy`, `locale`; `angular.json` build configuration
  `browser-test` (output `dist-browser`, locales en/ru, run as
  `production,browser-test`); `.gitignore` (`/dist-browser`, `/test-results`,
  `/playwright-report`); scripts `test:browser`, `test:browser:run`,
  `test:browser:typecheck`; exact-pinned `@playwright/test@1.63.0` and
  `socket.io@4.7.5` (matches the app's `socket.io-client@4.7.5`).
  `data-testid` only on icon-only controls: `project-back`, `add-node`,
  `run-pipeline`, `node-<key>`, `input-port-<id>`, `output-port-<key>`.
- Workflows (all 7): auth redirect/invalid credentials/sign-in/reload; canvas
  add, connect, move, edit input, save, reload, plus drag at zoom 0.5 (moves by
  screen distance ÷ zoom); YAML in real Monaco with unparseable and
  schema-invalid feedback and no PATCH until corrected; failed save → error →
  retry on navigation with asserted order PATCH 500 → PATCH 200 → GET; playground
  launch with `set_output`/`set_errors` events, unrelated-launch event ignored,
  balance 400 visible; canvas run joins the launch room, `node_error` marks only
  the matching node, interrupt clears the URL; deploy failure/retry/list and
  admin delete; Russian direct load, reload and navigation stay under `/ru/`.
- Decision: the browser build runs Angular in production mode. With
  `optimization: false` (dev mode) `ProjectComponent` throws NG0100 from its
  `child | is:` class binding — recorded as a follow-up.
- Bugs found (not fixed, outside the task's source scope):
  1. Owners cannot delete their own deployment: the UI sends
     `DELETE /api/deploys/<prefix>_<slug>` as one segment, which the backend
     (`remove-deploy.ts`) routes to admin-only `/api/deploys/:slug` with a wrong
     Redis key; the error is invisible because `remove()` reads `err.error`
     (undefined). Pinned with `test.fail`.
  2. Opening the canvas fires `GET /api/launches/<projectId>` because
     `LaunchResolver` inherits the project `:id` (backend answers 204).
  3. NG0100 in dev mode (above).
- Evidence (Node 26.12.0, Playwright Chromium headless shell 153.0.8010.12):
  three consecutive `npm run test:browser` runs, each 13 passed (12 + 1 expected
  failure), retries 0, wall 62 s / 54 s / 63 s (~40 s tests); no leftover
  servers or browsers; `npm run test:browser:typecheck` and ESLint clean; Karma
  also passed with `CHROME_BIN` set to Playwright's Chromium.
- Limitations: Chromium only; serial single worker.

### T008 — Gate CI and finish documentation

**Outcome:** future changes cannot publish an image while the frontend's required
checks fail, and another contributor can reproduce the suite.

**Ownership:** `.github/workflows/build.yml`, Makefile, frontend tests README,
AGENTS.md test commands, coverage/report configuration and this plan's records.

**Work:**

- Add a frontend test job with recursive submodule checkout, lockfile-based
  install/cache, explicit runtime/browser provisioning, test typecheck, targeted
  lint, fast tests with coverage, and Chromium workflows. Separate jobs are
  acceptable if artifact/build reuse is worthwhile.
- Require frontend and existing backend test jobs before the image build/push.
  Preserve existing backend checks. Do not require development credentials.
- Upload coverage and failure traces/screenshots even on failure, use bounded
  artifact retention, and make timeouts/cleanup explicit.
- Implement the proposed Makefile targets and document exact filtered-run,
  watch, browser installation and troubleshooting commands.
- Report coverage for Piper-owned models/utilities/services/guards/resolvers/
  components/directives, excluding generated schemas, locale data, third-party
  code, UI-kit and test helpers. Include untested source files in reports.
- Set a measured baseline after the planned behavior suites exist; record it and
  enforce no regression for the critical covered modules. Avoid a speculative
  repository-wide percentage that rewards trivial tests or broad exclusions.
- Track any known defect or omitted initial acceptance check with an owner and
  concrete blocker. Final completion cannot rely on silently skipped tests.

**Acceptance:**

- [ ] Required frontend checks run from a clean checkout in CI and failures block
      image publication. _(Workflow wired; not yet executed in CI.)_
- [ ] Coverage and browser failure artifacts are available for diagnosis.
      _(Upload steps configured; unverified until a CI run.)_
- [x] Root and frontend commands agree with documentation and run without local
      application services.
- [x] All initial workflow acceptance checks have evidence; deferred full-stack
      and cross-browser work is clearly identified.

**Verification:** run final root fast-suite and browser targets; verify an actual
CI run when repository access permits. If CI cannot be executed, record that
limitation and leave CI validation incomplete rather than claiming success.

**Completion record (2026-10-20, BLOCKED on the first CI run; everything
local is done):**

- `.github/workflows/build.yml`: new `frontend-tests` job (ubuntu-24.04, 30 min)
  — recursive submodule checkout, Node from `frontend/.nvmrc` (22, new file,
  matching the Dockerfile), lockfile npm cache, `npm ci`, `playwright install
--with-deps chromium`, `CHROME_BIN` set to Playwright's Chromium so Karma and
  Playwright share one browser, test + browser typecheck, `lint:tests`,
  `test:coverage` (10 min), `test:browser` (15 min, `CI=true`). Coverage is
  uploaded always (14 days); `test-results`/`playwright-report` on failure
  (7 days). `build` now `needs: [backend-tests, frontend-tests]`; backend checks
  unchanged; no credentials required.
- `Makefile`: `test-frontend` (typecheck, lint, Karma) and
  `test-frontend-browser`; `make test` runs `test-frontend` after the backend
  checks. `AGENTS.md` and `frontend/tests/README.md` document all commands,
  filtering, browser provisioning and troubleshooting.
- Coverage policy: reports cover Piper sources and exclude ui-kit, schemas,
  locale, tests and node_modules. 200 of 216 non-declaration `src` files appear
  in the report (the editor specs load `AppModule`); the 16 absent files are
  type-only (`src/types/*`), the entrypoint/env replacement (`main.ts`,
  `env.prod.ts`), or not imported anywhere (`feed-skeleton.module.ts` even
  imports a missing module, so forcing every file into the bundle would break
  compilation). Measured baseline: statements 53.03%, branches 48.70%,
  functions 44.95%, lines 53.08%; critical files: ProjectManager 95.4/90.1/100,
  HttpService 94.4/89.2/94.1, LiveService, MeManager, guards, login 100,
  AppConfig factory 100/87.5, deploy 98, playground 88.9/89.5/87.5, visual
  editor 70.9/56.8/75.9, launch models 84.7/72.7/74. `karma.conf.cjs` enforces
  floors a few points below that (global 50/45/42/50; critical modules
  90/85/90/90; playground 85; visual editor 68/54/72/68; launch models
  80/70/70/80). Verified: raising the critical floor to 100 made
  `npm run test:coverage` exit 1 naming the files.
- Evidence (local, macOS): Node 22.23.3 (via `npx -p node@22`) — `make test`
  exit 0 (backend 34 files, 404 passed + 1 expected fail; frontend 281/281) and
  `make test-frontend-browser` 13/13 in 35 s. Node 26.12.0 — `make
test-frontend` 281/281, `npm run test:coverage` 281/281 with floors met, four
  browser runs 13/13. `make test` refuses Node 26 by design (backend requires
  Node `>=22.12 <25`).
- Blocker: the CI workflow has not run — nothing is pushed. First push must
  confirm the `frontend-tests` job (Playwright system deps on ubuntu-24.04,
  Chrome sandbox flags, durations) before T008 can be marked DONE.

### Consolidated follow-ups

Deferred scope: full-stack browser tests against the real backend, browsers
other than Chromium, mobile viewports, pixel snapshots.

| Area      | Item                                                                                                                                                                                          | Found in   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Schema    | `launchRequest` schema declares `options.saveArtefacts`; models use `options.bucket` (and `additionalProperties: false`)                                                                      | T002       |
| Models    | class-transformer drops Map keys colliding with `Map.prototype` (`size`, `get`, `keys`, …): such port names are lost                                                                          | T003       |
| Autosave  | Revision conflicts are unrecoverable (no reload/merge); status stays `saving` after switching projects mid-save; unknown launch inputs not removed                                            | T003       |
| HTTP      | `HttpService` sends a bogus `contentType` header                                                                                                                                              | T004       |
| Signup    | `ng-hcaptcha` always rendered even when captcha is not required; no signup spec                                                                                                               | T004       |
| Pipes     | `CanPipe` leaks a `user$` subscription per transform; two pipes named `includes` (NG0313)                                                                                                     | T004, T005 |
| Tests     | Move `asJitPipes()` into `tests/setup.ts`; UiKitModule cannot load under JIT (pipes extending `UntilDestroyed`)                                                                               | T004, T005 |
| i18n      | Translate `message.pipeline_schema_invalid`                                                                                                                                                   | T005       |
| Editor    | `selectNode` host listener receives an undefined node; selectable directive and node-package editors untested                                                                                 | T005       |
| Launch UI | LaunchesComponent `authorization._id`, `err.error`, anonymous `me.user._id` crash; NodeLogs/NodeJobs hidden errors; NodeComponent poll after destroy; `run()` does not trigger a pending save | T006       |
| Routing   | Canvas route's `LaunchResolver` requests `GET /api/launches/<projectId>` (inherited `:id`)                                                                                                    | T007       |
| Dev mode  | `ProjectComponent` throws NG0100 from its `child \| is:` class binding with `optimization: false`                                                                                             | T007       |

## Suggested next-agent assignment

Push the branch and watch the `frontend-tests` job. If it passes and blocks
`build` on failure, record the run URL and duration in T008, tick its two CI
acceptance checks and mark T008 DONE. Then pick items from the consolidated
follow-ups, each with a failing test first.
