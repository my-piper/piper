/**
 * Runs every Vitest spec and hook in a zone.js ProxyZone.
 *
 * zone.js/testing does this for Jasmine, Jest and Mocha but has no Vitest
 * patch. Without it `fakeAsync` throws "Expected to be running in
 * 'ProxyZone'", and an NgZone created in a `beforeEach` (by `TestBed.inject`
 * or `createComponent`) forks the root zone, so the timers it schedules escape
 * the fake clock of the spec that follows. Every wrapped function shares one
 * ProxyZoneSpec, whose delegate `fakeAsync` swaps for the duration of a spec.
 */
type Fn = (...args: unknown[]) => unknown;

type ZoneGlobal = Record<string, unknown> & {
  __symbol__(name: string): string;
};

type ZoneTesting = { withProxyZone<F extends Fn>(fn: F): F };

const WRAPPED = Symbol.for("piper:proxy-zone");

const SPEC_APIS = ["it", "test"] as const;
const HOOK_APIS = ["beforeEach", "afterEach", "beforeAll", "afterAll"] as const;

function zoneTesting(): ZoneTesting {
  const { Zone } = globalThis as unknown as { Zone: ZoneGlobal };
  return Zone[Zone.__symbol__("fakeAsyncTest")] as ZoneTesting;
}

function inProxyZone(fn: unknown): unknown {
  return typeof fn === "function" ? zoneTesting().withProxyZone(fn as Fn) : fn;
}

/** Wraps the function arguments of a spec API, keeping its modifiers (`.each`, `.skip`, …). */
function wrapApi(original: Fn): Fn {
  const wrapped = function (this: unknown, ...args: unknown[]) {
    return original.apply(this, args.map(inProxyZone));
  };
  return Object.assign(wrapped, original);
}

export function installProxyZone() {
  const scope = globalThis as unknown as Record<
    string,
    Fn & { [WRAPPED]?: true }
  >;
  for (const name of [...SPEC_APIS, ...HOOK_APIS]) {
    const original = scope[name];
    if (!original || original[WRAPPED]) {
      continue;
    }
    scope[name] = Object.assign(wrapApi(original), {
      [WRAPPED]: true as const,
    });
  }
}
