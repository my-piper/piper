# Frontend testing implementation plan

Prepared: 2026-10-20. Planning only; implementation has not started.

This document is the implementation handoff and sole task-status index. It follows
the repository's [backend testing plan](backend-testing-plan.md) convention:
architecture, ordered task briefs, acceptance criteria, and evidence live together.
All commands and test files described as deliverables below are proposed, not
already available.

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

| Command in `frontend/` | Contract |
| --- | --- |
| `npm test` | Unit and component suites, headless, single run, no Docker |
| `npm run test:watch` | Local watch mode |
| `npm run test:typecheck` | Check all test/helper/config TypeScript; later include browser tests without global-type collisions |
| `npm run test:coverage` | Single run with text, HTML and machine-readable coverage |
| `npm run test:browser` | Build/serve the controlled browser target, execute Chromium workflows, stop owned processes |

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

| Fixture | Required content and assertions |
| --- | --- |
| Project A / Project B | Distinct `_id`, owner and revision; minimal valid pipelines; independent nested objects; never share mutable Maps |
| Small graph | Two nodes with scalar ports, pipeline input/output flows, start nodes and arrange coordinates; variants add JSON/image transformers |
| Serialization | Wire maps are keyed JSON objects; frontend representations are real Maps and class instances; dates round-trip as appropriate |
| Launch request | `inputs`, per-node `inputs`/`outputs`, `options.bucket`, and `inclusive.nodes`; distinguish absent, null, false, zero and empty string |
| Patch sequence | `PATCH /api/projects/:id/patch/:revision` with actual jsondiffpatch deltas; response includes a new revision; verify by applying deltas to a separate old snapshot |
| Revision failure | Use the current backend DataError response (HTTP 400), not an assumed 409; source: [patch-project.ts](../backend/api/projects/patch-project.ts) |
| Authentication | Fake authorization token/user, anonymous and owner/engineer/admin cases; verify headers, storage and UI permissions separately from backend authorization |
| Launch and events | Typed launch/output data plus `launch`, `node`, `event` fields for PipelineEvent; inspect each specialized event model rather than inventing a universal payload |
| Room lifecycle | `join_room`/`leave_room` carry the room name, matching [backend/sockets.ts](../backend/sockets.ts); multiple subscribers share one room |
| Runtime flags | Billing on/off, signup enabled/disabled, dummy base URL, captcha/assistant off by default; explicit variants override only relevant fields |

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

| ID | Task | Dependencies | Status |
| --- | --- | --- | --- |
| T001 | [Establish the Angular test harness](#t001--establish-the-angular-test-harness) | None | TODO |
| T002 | [Freeze fixtures and model contracts](#t002--freeze-fixtures-and-model-contracts) | T001 | TODO |
| T003 | [Protect autosave and graph sanitation](#t003--protect-autosave-and-graph-sanitation) | T002 | TODO |
| T004 | [Cover HTTP, session and routing](#t004--cover-http-session-and-routing) | T002 | TODO |
| T005 | [Test editing and canvas interactions](#t005--test-editing-and-canvas-interactions) | T003, T004 | TODO |
| T006 | [Test launches, live state and deployment UI](#t006--test-launches-live-state-and-deployment-ui) | T005 | TODO |
| T007 | [Add browser workflow coverage](#t007--add-browser-workflow-coverage) | T006 | TODO |
| T008 | [Gate CI and finish documentation](#t008--gate-ci-and-finish-documentation) | T001–T007 | TODO |

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

- [ ] A clean install with documented browser prerequisites can run typecheck,
  fast tests, coverage and targeted lint without backend services or Docker.
- [ ] Real templates and nested model transformations execute successfully.
- [ ] A deliberately unexpected application request fails the harness; timer or
  fixture leaks do not silently pass.
- [ ] Tests are absent from production bundles; application build still works.

**Verification:** run the new commands and one application build; record exact
runtime, browser and dependency versions. Demonstrate watch mode once. A harness
smoke test is useful here, but do not add an empty creation test for every class.

**Completion record:** Not started. No execution evidence recorded.

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

- [ ] Fixtures round-trip through real transformations and valid graph fixtures
  validate against checked-in schemas.
- [ ] Mutating Project A never changes another fixture or Project B.
- [ ] Wire patch/error/event contracts are documented with repository sources.

**Verification:** focused contract suite, fast-suite typecheck and lint. Assert
representative field values/types, not only equality of two calls to the same
conversion function.

**Completion record:** Not started. No execution evidence recorded.

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

- [ ] Saved snapshots/revisions advance only for successful matching saves.
- [ ] No-op updates send no patch; rapid edits produce the intended saved state.
- [ ] Failed/conflicting/pending saves do not lose later edits or corrupt another
  project.
- [ ] Sanitization removes invalid references while preserving valid outputs,
  inputs and explicit falsy values.

**Verification:** focused ProjectManager suite using virtual time and controlled
response ordering, then all fast tests and typecheck. Add regression tests before
any narrow production fix; record unresolved product behavior explicitly.

**Completion record:** Not started. No execution evidence recorded.

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

- [ ] All HTTP assertions use HttpTestingController and leave no pending request.
- [ ] Failed login does not persist credentials; 401 clears authorization state.
- [ ] Unsaved/failed edits cannot silently disappear through navigation.
- [ ] Route matching/resolution and owner/role UI checks use realistic models.

**Verification:** focused HTTP/session/router suites, then all fast tests and
typecheck. Do not treat hidden frontend controls as proof of backend authorization.

**Completion record:** Not started. No execution evidence recorded.

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

- [ ] Valid edits yield the expected graph and saved patch; rejected connections
  leave the graph unchanged.
- [ ] Deletion leaves no stale flow/start/request references after sanitation.
- [ ] Invalid YAML/JSON preserves valid state and exposes an actionable error.
- [ ] Read-only modes cannot modify the graph through tested UI interactions.

**Verification:** component/directive suites with DOM events and fake time, all
fast tests/typecheck, and application compilation if templates or code changed.

**Completion record:** Not started. No execution evidence recorded.

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

- [ ] The launch payload preserves form values; no launch occurs before required
  saving succeeds.
- [ ] Success, failure and interruption produce observable, correct UI state.
- [ ] Unrelated/stale events do not update the current launch or retain rooms.
- [ ] Deployment operations use expected contracts and recover from errors.

**Verification:** component/service suites with real models and explicit event
Subjects, all fast tests/typecheck. Keep a socket double at the boundary; T007
checks real Socket.IO transport against a fixture peer.

**Completion record:** Not started. No execution evidence recorded.

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

- [ ] Workflows use real interactions and persisted fixture state; no direct
  Angular component calls replace browser actions.
- [ ] HTTP and Socket.IO fixture contracts match inspected backend handlers.
- [ ] Locale paths, reloads, real canvas geometry and Monaco are exercised.
- [ ] Three consecutive runs pass without retries, leftover servers, shared
  storage, unexpected requests or unexplained browser errors.

**Verification:** the new browser command plus test typecheck. Record commands,
browser/runtime versions, run durations and artifacts. Explicitly describe this
as frontend integration coverage with a fixture backend.

**Completion record:** Not started. No execution evidence recorded.

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
  image publication.
- [ ] Coverage and browser failure artifacts are available for diagnosis.
- [ ] Root and frontend commands agree with documentation and run without local
  application services.
- [ ] All initial workflow acceptance checks have evidence; deferred full-stack
  and cross-browser work is clearly identified.

**Verification:** run final root fast-suite and browser targets; verify an actual
CI run when repository access permits. If CI cannot be executed, record that
limitation and leave CI validation incomplete rather than claiming success.

**Completion record:** Not started. No execution evidence recorded.

## Suggested next-agent assignment

Read AGENTS.md and `docs/frontend-testing-plan.md`, then implement T001 only.
Prove compatibility on the repository's Node 22 environment, add the Angular
test harness and its focused smoke/isolation tests, and run the T001 verification.
Resolve package/configuration details autonomously within the recorded scope;
do not upgrade Angular or implement later behavior suites. Update the T001
acceptance checks, completion record and sole status-table row with actual
evidence, then hand off T002. If compatibility needs a substantial migration,
report the exact blocker and proposed separate prerequisite.
