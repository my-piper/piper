/**
 * console.error guard for the fast suites: an error logged during a spec fails
 * it unless the spec declared it with `expectConsoleError()` beforehand, and a
 * declared error that never happens fails it too.
 */

type Expectation = { pattern: string | RegExp; seen: boolean };

const unexpected: string[] = [];
const expected: Expectation[] = [];

function describeArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.message;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function matches(pattern: string | RegExp, text: string): boolean {
  return typeof pattern === "string"
    ? text.includes(pattern)
    : pattern.test(text);
}

/** Declares one console.error the current spec is expected to log. */
export function expectConsoleError(pattern: string | RegExp) {
  expected.push({ pattern, seen: false });
}

/** Returns and clears guard problems: unexpected errors and missing expected ones. */
export function takeConsoleProblems(): string[] {
  const problems = [
    ...unexpected.map((text) => `Unexpected console.error: ${text}`),
    ...expected
      .filter((e) => !e.seen)
      .map(
        (e) =>
          `Expected console.error matching ${String(e.pattern)} was not logged`,
      ),
  ];
  unexpected.splice(0, unexpected.length);
  expected.splice(0, expected.length);
  return problems;
}

export function guardConsole() {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map(describeArg).join(" ");
    const expectation = expected.find((e) => matches(e.pattern, text));
    if (expectation) {
      expectation.seen = true;
      return;
    }
    unexpected.push(text);
    original(...args);
  };
}
