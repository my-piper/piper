// Vitest settings for the fast unit/component suites (tests/README.md).
// `ng test` (@angular/build:unit-test, angular.json) owns test discovery,
// the build, the browser and TestBed; this file adds what the builder options
// cannot express.
import { transform } from "esbuild";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Lowers native async/await in served dependencies to generators.
 *
 * Native `await` resumes on the engine's own Promise, not zone.js's
 * ZoneAwarePromise, so fakeAsync cannot flush continuations inside Angular
 * (router navigation, compileComponents, HttpClient). The application build
 * lowers async/await in every file when zone.js is a polyfill, but the
 * unit-test builder leaves node_modules to Vite, which serves them as is.
 * This applies the same esbuild lowering to them.
 */
function zoneAwareDependencies(): Plugin {
  return {
    name: "piper:zone-aware-dependencies",
    async transform(code, id) {
      if (!id.includes("/node_modules/") || !/\.m?js(\?|$)/.test(id)) {
        return null;
      }
      if (!/\basync\b/.test(code)) {
        return null;
      }
      const result = await transform(code, {
        loader: "js",
        format: "esm",
        sourcemap: true,
        sourcefile: id,
        supported: { "async-await": false },
      });
      return { code: result.code, map: result.map };
    },
  };
}

type Floor = {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
};

/** A floor every matching file must meet on its own. */
const perFile = (floor: Floor) => ({ ...floor, perFile: true });

// Per-file floor for the critical session/persistence modules.
const CRITICAL: Floor = {
  statements: 90,
  branches: 85,
  functions: 90,
  lines: 90,
};

export default defineConfig({
  plugins: [zoneAwareDependencies()],
  test: {
    // Same behaviour the Jasmine suite had: random order, a spec without
    // assertions fails, 10s per spec, and spies are restored after each spec.
    sequence: { shuffle: true },
    restoreMocks: true,
    expect: { requireAssertions: true },
    testTimeout: 10_000,
    // Drop zone.js and pre-bundled dependency frames from failure stacks: they
    // are the same in every fakeAsync/ProxyZone test and bury the spec line.
    onStackTrace: (_error, { file }) =>
      !file.includes("/node_modules/zone.js/") &&
      !file.includes("/node_modules/.vite/"),
    coverage: {
      provider: "istanbul",
      reportsDirectory: "coverage",
      reporter: ["html", "text-summary", "lcovonly", "json-summary"],
      // Filters the report only (the builder sets excludeAfterRemap); what gets
      // instrumented is set by `coverageInclude` in angular.json.
      exclude: [
        "src/schemas/**",
        "tests/**",
        "node_modules/**",
      ],
      // Floors a few points under the baseline measured on 2026-10-20
      // (docs/frontend-testing-plan.md, T008), global raised on 2026-10-22
      // after the signup/node-inputs/environment/packages suites. Raise them
      // as coverage grows; lowering one needs a reason in the plan.
      thresholds: {
        statements: 56,
        branches: 50,
        functions: 48,
        lines: 56,
        "src/services/project.manager.ts": perFile(CRITICAL),
        "src/services/http.service.ts": perFile(CRITICAL),
        "src/services/live.service.ts": perFile(CRITICAL),
        "src/services/me.service.ts": perFile(CRITICAL),
        "src/guards/*.ts": perFile(CRITICAL),
        "src/providers/app-config.ts": perFile(CRITICAL),
        // Branch floors re-measured under Vitest/istanbul on 2026-11-17: login
        // has 4 branches, one of them the constant ENV_MODE check
        // (docs/frontend-testing-plan.md).
        "src/app/signin/login.component.ts": perFile({
          ...CRITICAL,
          branches: 72,
        }),
        "src/app/deploy-pipeline/deploy-pipeline.component.ts":
          perFile(CRITICAL),
        "src/app/project-playground/project-playground.component.ts": perFile({
          statements: 85,
          branches: 73,
          functions: 85,
          lines: 85,
        }),
        "src/app/edit-pipeline-visual/edit-pipeline-visual.component.ts":
          perFile({ statements: 68, branches: 54, functions: 72, lines: 68 }),
        // Floors a few points under the coverage measured on 2026-10-22.
        "src/app/signup/signup.component.ts": perFile({
          statements: 90,
          branches: 50,
          functions: 90,
          lines: 90,
        }),
        "src/app/edit-node-inputs/edit-node-inputs.component.ts": perFile({
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        }),
        "src/app/edit-pipeline-environment/edit-pipeline-environment.component.ts":
          perFile({ statements: 90, branches: 80, functions: 85, lines: 90 }),
        "src/app/node-packages/node-packages.component.ts": perFile({
          statements: 78,
          branches: 55,
          functions: 72,
          lines: 78,
        }),
        "src/models/launch.ts": perFile({
          statements: 80,
          branches: 70,
          functions: 70,
          lines: 80,
        }),
      },
    },
  },
});
