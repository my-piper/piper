import { TestBed } from "@angular/core/testing";
import { resetPrerender } from "./config";
import { guardConsole, takeConsoleProblems } from "./console";

/**
 * Global per-spec isolation for the fast suites:
 *
 * - storage, cookies and the PRERENDER global are reset before every spec;
 * - application traffic through fetch/XMLHttpRequest/WebSocket/EventSource is
 *   rejected and fails the spec that caused it (HttpClient requests must go
 *   through HttpTestingController, sockets through SocketDouble);
 * - elements a spec leaves attached to <body> after TestBed teardown fail it;
 * - console.error calls not declared with `expectConsoleError()` fail it.
 */

const violations: string[] = [];

function reject(kind: string, url: string | URL): never {
  const message = `Unexpected ${kind} request to ${String(url)} — use HttpTestingController or a test double`;
  violations.push(message);
  throw new Error(message);
}

/** Returns and clears network violations; used by harness specs that provoke one on purpose. */
export function takeNetworkViolations(): string[] {
  return violations.splice(0, violations.length);
}

function guardNetwork() {
  window.fetch = (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input;
    try {
      reject("fetch", url);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    reject(`XMLHttpRequest ${method}`, url);
  } as typeof XMLHttpRequest.prototype.open;

  window.WebSocket = class {
    constructor(url: string | URL) {
      reject("WebSocket", url);
    }
  } as unknown as typeof WebSocket;

  window.EventSource = class {
    constructor(url: string | URL) {
      reject("EventSource", url);
    }
  } as unknown as typeof EventSource;
}

function clearCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

function bodyElements(): Element[] {
  return Array.from(document.body.children).filter(
    (e) => !["SCRIPT", "LINK", "STYLE"].includes(e.tagName),
  );
}

// The setup file runs again for every spec file; the global guards must wrap
// fetch/console only once, while the hooks belong to each file.
let guarded = false;

export function installIsolation() {
  if (!guarded) {
    guarded = true;
    guardNetwork();
    guardConsole();
  }
  const baseline = new Set(bodyElements());

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearCookies();
    resetPrerender();
    takeNetworkViolations();
    takeConsoleProblems();
  });

  afterEach(() => {
    // Every check runs, so one spec reports all of its isolation problems.
    const failures = takeNetworkViolations();

    // Tear down TestBed now so leftovers below are real leaks, not fixtures
    // Angular's own afterEach would remove a moment later.
    TestBed.resetTestingModule();
    const leaked = bodyElements().filter((e) => !baseline.has(e));
    if (leaked.length > 0) {
      leaked.forEach((e) => e.remove());
      failures.push(
        `Spec left ${leaked.length} element(s) attached to <body>: ${leaked
          .map((e) => e.tagName.toLowerCase())
          .join(", ")}`,
      );
    }

    // Checked after teardown so errors logged while destroying count too.
    failures.push(...takeConsoleProblems());

    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
  });
}
