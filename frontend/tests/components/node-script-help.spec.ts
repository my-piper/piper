import { TestBed } from "@angular/core/testing";
import { NodeScriptHelpComponent } from "src/app/node-script-help/node-script-help.component";
import { SCRIPT_EXAMPLES } from "src/app/node-script-help/script-examples";
import { configureAppTestingModule } from "../helpers/editor";

function setup({ scriptNode = false } = {}) {
  configureAppTestingModule();
  const fixture = TestBed.createComponent(NodeScriptHelpComponent);
  fixture.componentRef.setInput("scriptNode", scriptNode);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const tabs = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>("[tuiTab]"));
  const tab = (title: string) => tabs().find((t) => t.textContent === title);
  const code = () => element.querySelector("pre").textContent;
  return { fixture, element, tabs, tab, code };
}

type Run = (payload: object) => Promise<object & { state?: object }>;

// the run function of an example, with fetch replaced by a stub and console
// collecting what the node would log
function runOf(
  id: string,
  fetch: (url: string, init?: RequestInit) => unknown,
  logs: unknown[][] = [],
) {
  const { code } = SCRIPT_EXAMPLES.find((example) => example.id === id);
  const body = code.replace(/^export /gm, "");
  const log = (...args: unknown[]) => {
    logs.push(args);
  };
  const console = { info: log, error: log };
  return new Function("fetch", "console", `${body}\nreturn run;`)(
    fetch,
    console,
  ) as Run;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function rejection(run: Promise<unknown>) {
  return run.then(
    (): null => null,
    (error: Error & { code?: string }) => error,
  );
}

describe("node script examples", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("colours the code the way the script editor does once Monaco is loaded", async () => {
    vi.stubGlobal("monaco", {
      editor: {
        // the app's ThemeManager sets the theme of a loaded Monaco
        setTheme: (): void => undefined,
        colorize: async (code: string, language: string) =>
          `<span class="mtk8">${language}</span><span class="mtk1">${code.length}</span>`,
      },
    });
    const page = setup();

    await page.fixture.whenStable();
    page.fixture.detectChanges();

    const keyword = page.element.querySelector("pre .mtk8");
    expect(keyword.textContent).toBe("javascript");
    expect(page.code()).toBe(`javascript${SCRIPT_EXAMPLES[0].code.length}`);
  });

  it("lists every situation and starts with inputs and outputs", () => {
    const page = setup();

    const titles = page.tabs().map((tab) => tab.textContent);

    expect(titles).toEqual([
      "Inputs and outputs",
      "Different outputs",
      "Results of other nodes",
      "Environment Variables",
      "Images and files",
      "Libraries",
      "Long tasks",
      "Child Launches",
      "Errors and logs",
    ]);
    expect(page.code()).toContain('__type: "next"');
  });

  it("shows the example of the picked situation", () => {
    const page = setup();

    page.tab("Child Launches").click();
    page.fixture.detectChanges();

    expect(page.element.textContent).toContain(
      "A failed child fails this node",
    );
    expect(page.code()).toContain('__type: "launch"');
    expect(page.code()).toContain("children?.summary");
  });

  it("gives only valid JavaScript with a run function", () => {
    const examples = SCRIPT_EXAMPLES;

    // imports by URL can't run inside new Function, so they are left out
    const body = (code: string) =>
      code.replace(/^export /gm, "").replace(/^import .*$/gm, "");

    for (const code of [
      ...examples.map((example) => example.code),
      ...examples
        .filter((example) => example.scriptNode)
        .map((example) => example.scriptNode.code),
    ]) {
      expect(() => new Function(body(code))).not.toThrow();
      expect(body(code)).toMatch(/^async function run\(/m);
    }
  });

  it("reads Variables from env for a catalog node", () => {
    const page = setup();

    page.tab("Environment Variables").click();
    page.fixture.detectChanges();

    expect(page.code()).toContain("env.variables");
  });

  it("passes values through inputs for a Script Node, which has no Environment", () => {
    const page = setup({ scriptNode: true });

    page.tab("Environment Variables").click();
    page.fixture.detectChanges();

    expect(page.element.textContent).toContain(
      "A Script Node never reads an Environment",
    );
    expect(page.code()).toContain("inputs.apiKey");
    expect(page.code()).not.toContain("env");
  });
});

describe("node script examples at run time", () => {
  it("polls a long task until it finishes", async () => {
    const statuses = [
      { status: "running" },
      { status: "completed", url: "https://cdn.example.com/cat.png" },
    ];
    const run = runOf("repeat", async (_url, init) =>
      init?.method === "POST" ? json({ id: "job-1" }) : json(statuses.shift()),
    );

    const started = await run({ inputs: { prompt: "a cat" } });
    const checked = await run({ inputs: {}, state: started.state });
    const finished = await run({ inputs: {}, state: checked.state });

    expect(started).toEqual({
      __type: "repeat",
      state: { job: "job-1", attempt: 0 },
      progress: { total: 20, processed: 0 },
      delay: 3000,
    });
    expect(checked).toEqual({
      __type: "repeat",
      state: { job: "job-1", attempt: 1 },
      progress: { total: 20, processed: 1 },
      delay: 3000,
    });
    expect(finished).toEqual({
      __type: "next",
      outputs: { image: "https://cdn.example.com/cat.png" },
    });
  });

  it("gives up on a long task that failed or never finishes", async () => {
    const run = (status: string) =>
      runOf("repeat", async () => json({ status, error: "no GPU" }));

    const failed = await rejection(
      run("failed")({ inputs: {}, state: { job: "job-1", attempt: 3 } }),
    );
    const late = await rejection(
      run("running")({ inputs: {}, state: { job: "job-1", attempt: 20 } }),
    );

    expect(failed).toMatchObject({
      code: "FATAL_ERROR",
      message: "Job failed: no GPU",
    });
    expect(late).toMatchObject({ code: "TIMEOUT_ERROR" });
  });

  it("stops at once when the API key Variable is missing", async () => {
    const run = runOf("environment", async () => json({ answer: "42" }));

    const error = await rejection(
      run({ inputs: { question: "?" }, env: { variables: {}, scope: {} } }),
    );

    expect(error).toMatchObject({ code: "FATAL_ERROR" });
    expect(error.message).toContain("API_KEY");
  });

  it("passes images on as URLs", async () => {
    const run = runOf("images", async () =>
      json({
        results: [
          { url: "https://cdn.example.com/1.png" },
          { url: "https://cdn.example.com/2.png" },
        ],
      }),
    );

    const result = await run({
      inputs: { image: "https://cdn.example.com/0.png" },
    });

    expect(result).toEqual({
      __type: "next",
      outputs: {
        image: "https://cdn.example.com/1.png",
        variants: [
          "https://cdn.example.com/1.png",
          "https://cdn.example.com/2.png",
        ],
      },
    });
  });

  it("fails at once on a rejected request and retries a server error", async () => {
    const logs: unknown[][] = [];
    const run = (response: () => Response) =>
      runOf("errors", async () => response(), logs);
    const inputs = { url: "https://api.example.com/v1/page" };

    const rejected = await rejection(
      run(() => json({ error: "page is private" }, 403))({ inputs }),
    );
    const unreadable = await rejection(
      run(() => new Response("<html>Forbidden</html>", { status: 403 }))({
        inputs,
      }),
    );
    const unavailable = await rejection(
      run(() => new Response("", { status: 503 }))({ inputs }),
    );

    expect(rejected).toMatchObject({
      code: "FATAL_ERROR",
      message: "page is private",
    });
    expect(unreadable).toMatchObject({
      code: "FATAL_ERROR",
      message: "Request rejected: 403",
    });
    expect(unavailable.message).toContain("503");
    expect(unavailable.code).toBeUndefined();
    expect(logs).toContainEqual(["Rejected:", "page is private"]);
  });
});
