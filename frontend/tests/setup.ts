// Fast-suite setup file (angular.json `setupFiles`). Before it, `ng test`
// loads the polyfills of the `test` build configuration (zone.js and
// reflect-metadata, which must be evaluated before any decorated model is
// imported), zone.js/testing and @angular/localize/init, and initializes
// TestBed with errorOnUnknownElements/errorOnUnknownProperties and
// destroy-after-each teardown.
import { provideZoneChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { LaunchHeartbeatPipe } from "src/pipes/launch-heartbeat";
import { InputFlowsPipe, InputIndexOfPipe, NodePipe } from "src/pipes/node";
import { PipelineCostsPipe } from "src/pipes/pipeline-costs";
import { PipelineEnvironmentPipe } from "src/pipes/pipeline-environment";
import { PipelineNodeUpdatesPipe } from "src/pipes/pipeline-node-updates";
import { TickerPipe } from "src/pipes/ticker.pipe";
import { installIsolation } from "./helpers/isolation";
import { asJitPipes } from "./helpers/jit";
import { installProxyZone } from "./helpers/proxy-zone";

// First, so the hooks below and every spec run in a ProxyZone like under
// Jasmine (helpers/proxy-zone.ts).
installProxyZone();

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

// Since Angular 21 TestBed defaults to zoneless change detection; the app
// bootstraps with zone.js (src/main.ts), so the specs do too. Locate
// components by input value with `componentOf` (helpers/component.ts).
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideZoneChangeDetection()],
  });
});

// The app's index.html always sets <base href>, from which APP_BASE_HREF is
// derived; the Vitest tester page has none, so provide the root one.
if (!document.querySelector("base")) {
  const base = document.createElement("base");
  base.href = "/";
  document.head.prepend(base);
}

installIsolation();
