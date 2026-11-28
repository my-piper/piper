import { vi } from "vitest";
import { LaunchLiveState } from "packages/launches/live-state/live-state";
import type { MemoryStore } from "packages/launches/live-state/memory-store";

// One in-memory store for the whole test file. It is created before any mock
// factory runs, so suites that reload application modules still share it.
const liveStore: MemoryStore = await vi.hoisted(async () => {
  const { MemoryStore } = await import(
    "packages/launches/live-state/memory-store"
  );
  return new MemoryStore();
});

// The Launch live state runs on memory instead of Redis.
vi.mock("packages/launches/live-state/redis-store", () => ({
  redisStore: liveStore,
}));

/**
 * The Launch live state the application sees, for preparing and asserting
 * it. Clear `liveStore` between tests.
 */
export const liveState = new LaunchLiveState(liveStore);

export { liveStore };

/**
 * Spies on a live-state transition of every instance, the application's
 * included, e.g. to make it fail. Restored after each test.
 */
export function spyOnLiveState<K extends keyof LaunchLiveState>(method: K) {
  return vi.spyOn(LaunchLiveState.prototype, method);
}
