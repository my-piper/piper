// Karma configuration for the fast unit/component suites (tests/README.md).
const path = require("node:path");

const COVERAGE_DIR = path.join(__dirname, "coverage");

// Per-file floor for the critical session/persistence modules.
const CRITICAL = { statements: 90, branches: 85, functions: 90, lines: 90 };

module.exports = function (config) {
  config.set({
    basePath: "",
    frameworks: ["jasmine", "@angular-devkit/build-angular"],
    plugins: [
      require("karma-jasmine"),
      require("karma-chrome-launcher"),
      require("karma-jasmine-html-reporter"),
      require("karma-coverage"),
      require("@angular-devkit/build-angular/plugins/karma"),
    ],
    client: {
      jasmine: {
        random: true,
        failSpecWithNoExpectations: true,
        stopSpecOnExpectationFailure: false,
        timeoutInterval: 10000,
      },
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: COVERAGE_DIR,
      subdir: ".",
      reporters: [
        { type: "html" },
        { type: "text-summary" },
        { type: "lcovonly" },
        { type: "json-summary" },
      ],
      // Floors a few points under the baseline measured on 2026-10-20
      // (docs/frontend-testing-plan.md, T008), global raised on 2026-10-22
      // after the signup/node-inputs/environment/packages suites. Raise them as coverage grows;
      // lowering one needs a reason in the plan.
      check: {
        global: { statements: 56, branches: 50, functions: 48, lines: 56 },
        each: {
          statements: 0,
          branches: 0,
          functions: 0,
          lines: 0,
          overrides: {
            "**/src/services/project.manager.ts": CRITICAL,
            "**/src/services/http.service.ts": CRITICAL,
            "**/src/services/live.service.ts": CRITICAL,
            "**/src/services/me.service.ts": CRITICAL,
            "**/src/guards/*.ts": CRITICAL,
            "**/src/providers/app-config.ts": CRITICAL,
            "**/src/app/signin/login.component.ts": CRITICAL,
            "**/src/app/deploy-pipeline/deploy-pipeline.component.ts": CRITICAL,
            "**/src/app/project-playground/project-playground.component.ts": {
              statements: 85,
              branches: 85,
              functions: 85,
              lines: 85,
            },
            "**/src/app/edit-pipeline-visual/edit-pipeline-visual.component.ts":
              { statements: 68, branches: 54, functions: 72, lines: 68 },
            // Floors a few points under the coverage measured on 2026-10-22.
            "**/src/app/signup/signup.component.ts": {
              statements: 90,
              branches: 50,
              functions: 90,
              lines: 90,
            },
            "**/src/app/edit-node-inputs/edit-node-inputs.component.ts": {
              statements: 90,
              branches: 80,
              functions: 90,
              lines: 90,
            },
            "**/src/app/edit-pipeline-environment/edit-pipeline-environment.component.ts":
              { statements: 90, branches: 80, functions: 85, lines: 90 },
            "**/src/app/node-packages/node-packages.component.ts": {
              statements: 78,
              branches: 55,
              functions: 72,
              lines: 78,
            },
            "**/src/models/launch.ts": {
              statements: 80,
              branches: 70,
              functions: 70,
              lines: 80,
            },
          },
        },
      },
    },
    reporters: ["progress", "kjhtml"],
    browsers: ["ChromeHeadlessCI"],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: "ChromeHeadless",
        flags: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      },
    },
    browserNoActivityTimeout: 60000,
    captureTimeout: 60000,
    restartOnFileChange: true,
  });
};
