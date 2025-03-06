import { Counter, Gauge, Registry } from "prom-client";

export const registry = new Registry();
export const metrics = {
  minions: {
    faceSwap: {
      timeouts: new Counter({
        name: "minions_face_swap_timeouts",
        help: "How many timeouts for face swap",
        registers: [registry],
      }),
      completed: new Counter({
        name: "minions_face_swap_completed",
        help: "How many completed for face swap",
        registers: [registry],
      }),
      failed: new Counter({
        name: "minions_face_swap_failed",
        help: "How many failed for face swap",
        registers: [registry],
      }),
    },
  },
  queue: {
    active: new Gauge({
      name: "bull_active",
      help: "Count of active jobs",
      registers: [registry],
      labelNames: ["queue"],
    }),
    waiting: new Gauge({
      name: "bull_waiting",
      help: "Count of waiting jobs",
      registers: [registry],
      labelNames: ["queue"],
    }),
    completed: new Gauge({
      name: "bull_completed",
      help: "Count of completed jobs",
      registers: [registry],
      labelNames: ["queue"],
    }),
    failed: new Gauge({
      name: "bull_failed",
      help: "Count of failed jobs",
      registers: [registry],
      labelNames: ["queue"],
    }),
    delayed: new Gauge({
      name: "bull_delayed",
      help: "Count of delayed jobs",
      registers: [registry],
      labelNames: ["queue"],
    }),
  },
};
