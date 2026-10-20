// Fast-suite entry point. Polyfills (zone.js, zone.js/testing and
// @angular/localize/init) are loaded by angular.json before this file;
// reflect-metadata must be evaluated before any decorated model is imported.
import "reflect-metadata";

import { getTestBed } from "@angular/core/testing";
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from "@angular/platform-browser-dynamic/testing";
import { installIsolation } from "./helpers/isolation";

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  {
    teardown: { destroyAfterEach: true, rethrowErrors: true },
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  },
);

installIsolation();
