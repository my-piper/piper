import { LaunchLiveState } from "./live-state";
import { redisStore } from "./redis-store";

export * from "./live-state";

/** The Launch live state, kept in Redis. Unit tests swap the store. */
export const liveState = new LaunchLiveState(redisStore);
