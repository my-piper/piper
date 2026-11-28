import { liveState } from "packages/launches/live-state";
import { expect, vi } from "vitest";

/**
 * Waits until the launch has finished (every pipeline output it waits for
 * has a value) and returns its `result` output, parsed. A finished launch
 * has its outputs written in the same transaction, so nothing else needs
 * polling.
 */
export async function finishedOutput(
  id: string,
  wait = { timeout: 20_000, interval: 50 }
): Promise<unknown> {
  const launch = await liveState.get(id);
  await vi.waitFor(
    async () => expect(await liveState.isFinished(launch)).toBe(true),
    wait
  );
  return JSON.parse((await liveState.output(launch, "result")) as string);
}
