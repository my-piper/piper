import {
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { RunScope } from "models/run-scope";
import { leaveScope, turnInScope } from "packages/launches/scope";
import { beforeEach, describe, expect, it } from "vitest";

const SCOPE = "scope-test";

// queues these launches in the scope; the live ones beat
async function queued(launches: { id: string; live: boolean }[]) {
  for (const { id, live } of launches) {
    const launch = launchFixture();
    launch._id = id;
    await liveState.create(launch, []);
    if (live) {
      await liveState.beat(id);
    }
  }
}

beforeEach(() => {
  resetExecutionDoubles();
});

describe("a launch's turn in its scope", () => {
  it.each([
    {
      name: "an unlimited scope",
      maxConcurrent: 0,
      queue: [],
      launch: "b",
      wait: [0, 0],
    },
    {
      name: "an empty scope",
      maxConcurrent: 1,
      queue: [],
      launch: "b",
      wait: [0, 0],
    },
    {
      name: "a place within the limit",
      maxConcurrent: 2,
      queue: [
        { id: "a", live: true },
        { id: "b", live: true },
      ],
      launch: "b",
      wait: [0, 0],
    },
    {
      name: "a place past the limit",
      maxConcurrent: 1,
      queue: [
        { id: "a", live: true },
        { id: "b", live: true },
      ],
      launch: "b",
      wait: [6000, 8000],
    },
    {
      name: "a place behind a dead launch",
      maxConcurrent: 1,
      queue: [
        { id: "a", live: false },
        { id: "b", live: true },
      ],
      launch: "b",
      wait: [0, 0],
    },
    {
      name: "no place in the scope",
      maxConcurrent: 1,
      queue: [{ id: "a", live: true }],
      launch: "b",
      wait: [10000, 10000],
    },
  ])("$name waits $wait ms", async ({ maxConcurrent, queue, launch, wait }) => {
    await queued(queue);

    const turn = await turnInScope(
      launch,
      new RunScope({ id: SCOPE, activated: true, maxConcurrent })
    );

    expect([turn >= wait[0], turn <= wait[1]]).toEqual([true, true]);
  });

  it("gives the place of a launch that leaves its scope to the next one", async () => {
    await queued([
      { id: "a", live: true },
      { id: "b", live: true },
    ]);
    const leaving = launchFixture();
    leaving._id = "a";

    await leaveScope(leaving);

    expect(await liveState.scopeQueue(SCOPE, 10)).toEqual({
      waiting: 1,
      live: ["b"],
    });
  });
});
