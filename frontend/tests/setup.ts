// Fast-suite entry point. Polyfills (zone.js, zone.js/testing,
// @angular/localize/init and reflect-metadata, which must be evaluated before
// any decorated model is imported) are loaded by angular.json before this file.
import {
  provideNgReflectAttributes,
  provideZoneChangeDetection,
} from "@angular/core";
import { getTestBed, TestBed } from "@angular/core/testing";
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from "@angular/platform-browser-dynamic/testing";
import { LaunchHeartbeatPipe } from "src/pipes/launch-heartbeat";
import { InputFlowsPipe, InputIndexOfPipe, NodePipe } from "src/pipes/node";
import { PipelineCostsPipe } from "src/pipes/pipeline-costs";
import { PipelineEnvironmentPipe } from "src/pipes/pipeline-environment";
import { PipelineNodeUpdatesPipe } from "src/pipes/pipeline-node-updates";
import { TickerPipe } from "src/ui-kit/pipes/ticker.pipe";
import { installIsolation } from "./helpers/isolation";
import { asJitPipes } from "./helpers/jit";

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  {
    teardown: { destroyAfterEach: true, rethrowErrors: true },
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  },
);

// Every pipe that extends the UntilDestroyed directive base inherits a
// standalone `ɵdir`. Since Angular 20 the JIT dependency tracker treats a
// module declaring such a pipe as poisoned and caches an empty scope, so the
// shadowing must happen before any spec computes a module scope.
asJitPipes(
  TickerPipe,
  NodePipe,
  InputIndexOfPipe,
  InputFlowsPipe,
  PipelineCostsPipe,
  LaunchHeartbeatPipe,
  PipelineEnvironmentPipe,
  PipelineNodeUpdatesPipe,
);

// Angular 20 stopped emitting `ng-reflect-*` attributes in dev mode; some
// specs still locate inputs by them. Since Angular 21 TestBed defaults to
// zoneless change detection; the app bootstraps with zone.js (src/main.ts),
// so the specs do too.
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideNgReflectAttributes(), provideZoneChangeDetection()],
  });
});

// The app's index.html always sets <base href>, from which APP_BASE_HREF is
// derived; Karma's context page has none, so provide the root one.
if (!document.querySelector("base")) {
  const base = document.createElement("base");
  base.href = "/";
  document.head.prepend(base);
}

installIsolation();
