# Coding standards

Rules a reviewer checks that no linter or type checker catches. Read this when
reviewing a diff; for how to write the code in the first place, see `AGENTS.md`
and the test READMEs it points to. Each rule names its reason so that a
reviewer can tell when it does not apply.

## Frontend tests (`frontend/tests`, `frontend/vitest.config.ts`)

Background: [ADR 0002](docs/adr/0002-vitest-browser-mode-with-zone-testing.md)
and [`frontend/tests/README.md`](frontend/tests/README.md). Each rule below
cost a debug cycle during the Karma → Vitest migration (#95).

- **Global setup must be idempotent.** `tests/setup.ts` (`setupFiles` in
  `angular.json`) runs once per spec file in the same browser page, not once
  per run. Anything it installs on a global — patching `window`, `console`,
  `fetch`, a prototype, `Zone`, adding listeners or DOM nodes, registering
  `beforeEach`/`afterEach` in a helper — must detect that it is already
  installed (a marker symbol, `if (!document.querySelector(...))`) or be undone
  in a matching hook. A patch that wraps the previous value without a guard
  stacks one layer per spec file. Flag any new global patch in `tests/setup.ts`
  or `tests/helpers/*` that lacks a guard or a teardown.
- **Spies are restored by config, not by hand.** `restoreMocks: true` in
  `vitest.config.ts` restores `vi.spyOn` after every spec. Do not turn it off,
  and do not rely on a spy surviving into the next spec. Replacing a global by
  assignment (`window.x = ...`) is not a spy and is not restored: use
  `vi.spyOn`, or `vi.stubGlobal` with `vi.unstubAllGlobals()` in an
  `afterEach`.
- **Hooks and specs run in the ProxyZone.** `tests/helpers/proxy-zone.ts` wraps
  `it`/`beforeEach`/`afterEach` so they run in zone.js's ProxyZone, as the
  Jasmine patch did. Code that Vitest calls directly — `describe` bodies,
  `beforeAll`, callbacks passed to Vitest APIs other than those hooks — runs
  outside it, so an `NgZone` or `TestBed` created there escapes `fakeAsync`.
  Flag Angular setup moved into `beforeAll` or a `describe` body.
- **Native `await` escapes the fake clock.** The esbuild plugin in
  `vitest.config.ts` lowers `async`/`await` in `node_modules` so `fakeAsync`
  controls it. Inside a `fakeAsync` spec, do not `await` real promises; use
  `tick`/`flush`/`flushMicrotasks`. A spec that needs native `await` is an
  async spec without `fakeAsync`.
- **Changes to the shims re-check ADR 0002.** A diff touching
  `tests/helpers/proxy-zone.ts` or the `zoneAwareDependencies` plugin in
  `vitest.config.ts`, or bumping Angular, zone.js or Vitest,
  must say how the consequences in ADR 0002 were re-checked (run the full
  `npm test` with a few seeds). Flag it if the PR does not.
- **Isolation stays strict.** Do not add allow-lists to `tests/helpers/isolation.ts`
  to make a spec pass: a spec that issues a real request, leaves DOM behind or
  logs an undeclared `console.error` is the defect. Use
  `HttpTestingController`, `provideSocketDouble()` or `expectConsoleError()`.
