# Frontend fast suites run on Vitest in a real browser and keep zone.js fakeAsync

The frontend unit and component suites moved from Karma + Jasmine to Vitest through Angular's `@angular/build:unit-test` builder. They run in **browser mode** (headless Chromium via Playwright), not in jsdom or happy-dom, the builder's default. The isolation layer (`tests/helpers/isolation.ts`) guards the real `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource`, the specs compile real templates, and the canvas specs depend on layout and pointer events. A simulated DOM would quietly change what those specs check. CI already installs Playwright's Chromium for the browser workflows, so this adds no new dependency there.

The app runs on zone.js, so the specs keep zone.js `fakeAsync`/`tick` (399 call sites) rather than being rewritten to `vi.useFakeTimers`. Two shims make that work under Vitest, which zone.js has no patch for:

- `tests/helpers/proxy-zone.ts` runs every spec and hook in the shared ProxyZone, as zone.js's Jasmine patch did. Without it, an NgZone created in a `beforeEach` forks the root zone, and its timers escape the fake clock.
- A Vite plugin in `frontend/vitest.config.ts` lowers `async`/`await` in dependencies with esbuild, as the application build does when zone.js is a polyfill. The unit-test builder leaves `node_modules` to Vite, and native `await` inside Angular (router, `compileComponents`) would otherwise resume outside `fakeAsync`.

## Consequences

- Both shims depend on zone.js and builder internals (`Zone[__symbol__("fakeAsyncTest")].withProxyZone`, Vite serving dependencies unbundled). Re-check them after Angular, zone.js or Vitest upgrades. If the app goes zoneless, remove both and port the specs to `vi.useFakeTimers`.
- Running in a real browser is slower than jsdom would be, and needs Playwright's Chromium installed locally.
- Coverage uses istanbul on the built bundle, so branch counts differ from karma-coverage. The floors were re-measured once (see `docs/frontend-testing-plan.md`, 2026-11-17).
