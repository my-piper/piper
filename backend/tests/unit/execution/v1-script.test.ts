import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fromV1Script } from "packages/pipelines/v1/v1-script";
import { afterEach, describe, expect, it, vi } from "vitest";

type Run = (payload: object) => Promise<Record<string, unknown>>;

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true }))
  );
});

/** Loads a converted script as the runtime would: an ES module with `run`. */
async function load(script: string): Promise<Run> {
  const dir = await mkdtemp(join(tmpdir(), "v1-script-"));
  directories.push(dir);
  const file = join(dir, "script.mjs");
  await writeFile(file, fromV1Script(script));
  const module = await import(/* @vite-ignore */ pathToFileURL(file).href);
  return module.run as Run;
}

/** The shape of a Piper v1 moderation Node that checks an image in another Deploy. */
const NESTED_SCRIPT = `const CHECK_TASK_INTERVAL = 3000;

export async function run({ inputs, state }) {
    const { endpoint, image } = inputs;
    const { FatalError, NextNode, RepeatNode } = DEFINITIONS;

    if (!state) {
        const { _id: launch } = await nested.run(endpoint, { inputs: { image } });
        return RepeatNode.from({ delay: CHECK_TASK_INTERVAL, state: { launch, attempt: 0 } });
    }

    const { launch, attempt } = state;
    const { outputs, errors } = await nested.state(launch);
    if (errors.length > 0) {
        throw new FatalError(errors.join('. '));
    }

    const violations = outputs?.get('labels');
    if (violations) {
        if (violations.length > 0) {
            throw new FatalError(\`Image is blocked: \${violations.join(', ')}\`);
        }
        return NextNode.from({ outputs: { image } });
    }

    return RepeatNode.from({ delay: CHECK_TASK_INTERVAL, state: { launch, attempt: attempt + 1 } });
}`;

const INPUTS = { endpoint: "violations-detector-v4", image: "https://x/a.png" };

describe("v1 script as a Script Node", () => {
  it("starts the nested Deploy as a Child Launch on its first run", async () => {
    const run = await load(NESTED_SCRIPT);

    const result = await run({ inputs: INPUTS, state: null });

    expect(result).toEqual({
      __type: "launch",
      launches: [
        {
          key: "nested_1",
          deploy: { slug: "violations-detector-v4" },
          inputs: { image: "https://x/a.png" },
        },
      ],
      delay: 3000,
    });
  });

  it("keeps the started child in its state once the child exists", async () => {
    const run = await load(NESTED_SCRIPT);
    const children = {
      nested_1: { launch: "child", status: "running", outputs: {} },
    };

    const result = await run({ inputs: INPUTS, state: null, children });

    expect(result).toEqual({
      __type: "repeat",
      delay: 3000,
      state: { launch: "nested_1", attempt: 0 },
    });
  });

  it("waits until the child finished, even when some outputs arrived", async () => {
    const run = await load(NESTED_SCRIPT);
    const children = {
      nested_1: { launch: "child", status: "running", outputs: { labels: [] } },
    };

    const result = await run({
      inputs: INPUTS,
      state: { launch: "nested_1", attempt: 0 },
      children,
    });

    expect(result).toMatchObject({
      __type: "repeat",
      state: { launch: "nested_1", attempt: 1 },
    });
  });

  it("reads the child's outputs once it finished", async () => {
    const run = await load(NESTED_SCRIPT);
    const children = {
      nested_1: {
        launch: "child",
        status: "finished",
        outputs: { labels: [] },
      },
    };

    const result = await run({
      inputs: INPUTS,
      state: { launch: "nested_1", attempt: 3 },
      children,
    });

    expect(result).toEqual({
      __type: "next",
      outputs: { image: "https://x/a.png" },
    });
  });

  it("fails the Node with a fatal error the runtime recognises", async () => {
    const run = await load(NESTED_SCRIPT);
    const children = {
      nested_1: {
        launch: "child",
        status: "finished",
        outputs: { labels: ["underage"] },
      },
    };

    const failure = run({
      inputs: INPUTS,
      state: { launch: "nested_1", attempt: 0 },
      children,
    });

    await expect(failure).rejects.toMatchObject({
      code: "FATAL_ERROR",
      message: "Image is blocked: underage",
    });
  });

  it("gives a v1 script Buffer when it uses one", async () => {
    const run = await load(`export async function run({ inputs }) {
    const { NextNode } = DEFINITIONS;
    return NextNode.from({ outputs: { auth: Buffer.from(inputs.user).toString('base64') } });
}`);

    const result = await run({ inputs: { user: "a:b" } });

    expect(result).toEqual({ __type: "next", outputs: { auth: "YTpi" } });
  });

  it("reads every Environment Variable as empty, so an optional call is skipped", async () => {
    const run = await load(`export async function run() {
    const { NextNode } = DEFINITIONS;
    const user = env.variables?.get('N8N_USER');
    const password = env.variables.get('N8N_PASSWORD');
    return NextNode.from({ outputs: { notified: Boolean(user && password) } });
}`);

    const result = await run({ inputs: {} });

    expect(result).toEqual({ __type: "next", outputs: { notified: false } });
  });

  it("fails a Node that requires a module with a fatal error naming it", async () => {
    const run = await load(`export async function run() {
    const sharp = require('sharp');
    return DEFINITIONS.NextNode.from({ outputs: {} });
}`);

    const failure = run({ inputs: {} });

    await expect(failure).rejects.toMatchObject({
      code: "FATAL_ERROR",
      message:
        "require('sharp') isn't available any more: rewrite this Node with an import",
    });
  });

  it("writes a v1 message to the Node's log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const run = await load(`export async function run() {
    message('Image sent', 'defect');
    return DEFINITIONS.NextNode.from({ outputs: {} });
}`);

    await run({ inputs: {} });

    expect(log).toHaveBeenCalledWith("[defect] Image sent");
  });

  it("keeps a v1 script's own message, env and require over the stand-ins", async () => {
    const run = await load(`const env = { variables: new Map([['MODE', 'fast']]) };
function message(text) {
    return \`own: \${text}\`;
}
const require = (module) => module.toUpperCase();

export async function run() {
    const { NextNode } = DEFINITIONS;
    return NextNode.from({
        outputs: { mode: env.variables.get('MODE'), said: message('hi'), lib: require('sharp') },
    });
}`);

    const result = await run({ inputs: {} });

    expect(result).toEqual({
      __type: "next",
      outputs: { mode: "fast", said: "own: hi", lib: "SHARP" },
    });
  });
});
