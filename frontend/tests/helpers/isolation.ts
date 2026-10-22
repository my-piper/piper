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

// Same-origin paths the Karma runner and webpack chunk loader need.
const ALLOWED_PATHS = [/^\/_karma_webpack_\//, /^\/base\//, /^\/absolute\//];

const violations: string[] = [];

function isAllowed(url: string | URL): boolean {
  const parsed = new URL(String(url), location.href);
  if (parsed.origin !== location.origin) {
    return false;
  }
  return ALLOWED_PATHS.some((pattern) => pattern.test(parsed.pathname));
}

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
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input;
    if (!isAllowed(url)) {
      try {
        reject("fetch", url);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return originalFetch(input, init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    if (!isAllowed(url)) {
      reject(`XMLHttpRequest ${method}`, url);
    }
    return (originalOpen as (...args: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest,
    );
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

export function installIsolation() {
  guardNetwork();
  guardConsole();
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
    const network = takeNetworkViolations();
    if (network.length > 0) {
      fail(network.join("\n"));
    }

    // Tear down TestBed now so leftovers below are real leaks, not fixtures
    // Angular's own afterEach would remove a moment later.
    TestBed.resetTestingModule();
    const leaked = bodyElements().filter((e) => !baseline.has(e));
    if (leaked.length > 0) {
      leaked.forEach((e) => e.remove());
      fail(
        `Spec left ${leaked.length} element(s) attached to <body>: ${leaked
          .map((e) => e.tagName.toLowerCase())
          .join(", ")}`,
      );
    }

    // Checked after teardown so errors logged while destroying count too.
    const problems = takeConsoleProblems();
    if (problems.length > 0) {
      fail(problems.join("\n"));
    }
  });
}
