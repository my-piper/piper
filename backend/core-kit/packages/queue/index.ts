export * from "./classes";
export * from "./consts";

import { Job as BullJob } from "bullmq";
export type Job = BullJob;
