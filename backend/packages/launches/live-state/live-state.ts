import { toInstance, toPlain } from "core-kit/packages/transform";
import { Launch } from "models/launch";
import { LaunchRunStatus } from "models/launch-run";
import { NodeInput, NodeStatus } from "models/node";
import { Primitive } from "types/primitive";
import { fromRedisValue, toRedisValue } from "utils/redis";
import { isFinished, requiredOutputs } from "../finished";
import {
  LAUNCH,
  LAUNCH_EXPIRED,
  LAUNCH_HEARTBEAT,
  LAUNCH_HEARTBEAT_EXPIRED,
  LAUNCH_INTERRUPTED,
  LAUNCH_RUN_RECORDED,
  NODE_CHILDREN,
  NODE_EXECUTION,
  NODE_FLOWS,
  NODE_INPUT,
  NODE_JOB_DUE,
  NODE_JOBS,
  NODE_LOGS,
  NODE_LOGS_DROPPED,
  NODE_LOGS_LIMIT,
  NODE_OUTPUTS,
  NODE_PROCESSED_LOCK,
  NODE_PROCESSING_LOCK,
  NODE_PROCESSING_TIMEOUT,
  NODE_PROGRESS,
  NODE_STATE,
  NODE_STATUS,
  PIPELINE_ERRORS,
  PIPELINE_OUTPUT,
  PIPELINE_OUTPUT_DATA,
} from "./keys";
import { Command, LiveStore } from "./store";

const LOCKED = "x";

/** A value a Node input gets: from the launch request, a default or a Flow. */
export type InputValue = { node: string; input: string; value: Primitive };

/** What a Node's completion writes, in the order it applies. */
export type NodeCompletion = {
  // the converted outputs; absent when the result carried none
  outputs?: Record<string, Primitive>;
  // the Node does not run again until a Flow into it reruns it
  processed: boolean;
  // inputs of the Node itself that are cleared for its next run
  resetInputs?: string[];
  // values its Flows carry to downstream Node inputs
  inputs?: InputValue[];
  // its Flows that are done, by the Node they lead to
  flows?: { node: string; flow: string }[];
  // downstream Nodes that run again: their status, state, children,
  // progress and processed lock are cleared
  rerun?: string[];
  // values it gives to pipeline outputs
  pipelineOutputs?: Record<string, Primitive>;
};

/** How a Node's failed attempt ends. */
export type NodeFailure =
  // it runs again: the backoff is counted as wait time of the next run
  | { outcome: "retry"; job: string; dueAt: number }
  // no attempts are left: the error joins the end of the Launch's errors
  | { outcome: "exhausted" }
  // it cannot run again: the error goes first among the Launch's errors
  | { outcome: "fatal" };

/** A Node's open execution: its invocations until the final outcome. */
export type OpenExecution = {
  startedAt: number;
  finishedAt: number;
  waitMs: number;
  activeMs: number;
  invocations: number;
  attempts: number;
};

export type Invocation = {
  startedAt: Date;
  finishedAt: number;
  waitMs: number;
  durationMs: number;
  attempt: number;
};

/**
 * The live state of Launches: what runs, waits, failed or finished, and the
 * values passing between Nodes. It owns the storage layout and the expiry of
 * every key, and applies each transition in one atomic batch. Its interface
 * speaks of Launches and Nodes; the store under it is Redis in production and
 * memory in unit tests.
 */
export class LaunchLiveState {
  constructor(private readonly store: LiveStore) {}

  private async one<T>(command: Command): Promise<T> {
    const [reply] = await this.store.exec([command]);
    return reply as T;
  }

  private async readJson(key: string): Promise<object | null> {
    const json = await this.one<string | null>({ op: "get", key });
    return json ? (JSON.parse(json) as object) : null;
  }

  private setJson(key: string, data: object, ttl = LAUNCH_EXPIRED): Command {
    return { op: "set", key, value: JSON.stringify(data), ttl };
  }

  // ---- Launch

  /**
   * Stores a new Launch with its first Node inputs, and queues it in its
   * concurrency scope when it has one.
   */
  async create(launch: Launch, inputs: InputValue[]): Promise<void> {
    const { _id, pipeline, scope } = launch;
    await this.store.exec([
      ...inputs.map(
        ({ node, input, value }): Command => ({
          op: "set",
          key: NODE_INPUT(_id, node, input),
          value: toRedisValue(
            pipeline.nodes.get(node).inputs.get(input).type,
            value
          ),
          ttl: LAUNCH_EXPIRED,
        })
      ),
      this.setJson(LAUNCH(_id), toPlain(launch)),
      ...(scope?.activated
        ? [{ op: "rPush", key: scope.id, values: [_id] } as Command]
        : []),
    ]);
  }

  /** Saves a Launch that has started, keeping its expiry. */
  async started(launch: Launch): Promise<void> {
    await this.one({
      op: "set",
      key: LAUNCH(launch._id),
      value: JSON.stringify(toPlain(launch)),
      keepTtl: true,
    });
  }

  async getPlain(launch: string): Promise<object | null> {
    return this.readJson(LAUNCH(launch));
  }

  async get(launch: string): Promise<Launch | null> {
    const plain = await this.getPlain(launch);
    return plain ? toInstance(plain, Launch) : null;
  }

  async exists(launch: string): Promise<boolean> {
    return (await this.one<number>({ op: "exists", key: LAUNCH(launch) })) > 0;
  }

  async interrupt(launch: string, at = new Date()): Promise<void> {
    await this.one({
      op: "set",
      key: LAUNCH_INTERRUPTED(launch),
      value: at.toISOString(),
      ttl: LAUNCH_EXPIRED,
    });
  }

  /** When the Launch was interrupted, or null while it is not. */
  async interruptedAt(launch: string): Promise<Date | null> {
    const at = await this.one<string | null>({
      op: "get",
      key: LAUNCH_INTERRUPTED(launch),
    });
    return at === null ? null : new Date(at);
  }

  /** Tells the Launch is alive; the sign lasts LAUNCH_HEARTBEAT_EXPIRED. */
  async beat(launch: string, at = new Date()): Promise<void> {
    await this.one({
      op: "set",
      key: LAUNCH_HEARTBEAT(launch),
      value: at.toISOString(),
      ttl: LAUNCH_HEARTBEAT_EXPIRED,
    });
  }

  /** The time of the Launch's last heartbeat while it is alive. */
  async heartbeat(launch: string): Promise<string | null> {
    return this.one({ op: "get", key: LAUNCH_HEARTBEAT(launch) });
  }

  /**
   * The first `count + 1` Launches waiting in a concurrency scope (`waiting`)
   * and those of them still alive, in order (`live`). Dead ones (without a
   * heartbeat) leave the scope.
   */
  async scopeQueue(
    scope: string,
    count: number
  ): Promise<{ waiting: number; live: string[] }> {
    const queue =
      (await this.one<string[]>({
        op: "lRange",
        key: scope,
        start: 0,
        stop: count,
      })) ?? [];
    if (queue.length === 0) {
      return { waiting: 0, live: [] };
    }
    const heartbeats = await this.store.exec(
      queue.map((id) => ({ op: "exists", key: LAUNCH_HEARTBEAT(id) }))
    );
    const dead = queue.filter((_, i) => heartbeats[i] === 0);
    if (dead.length > 0) {
      await this.store.exec(
        dead.map((id) => ({ op: "lRem", key: scope, value: id }))
      );
    }
    return {
      waiting: queue.length,
      live: queue.filter((_, i) => heartbeats[i] !== 0),
    };
  }

  async leaveScope(scope: string, launch: string): Promise<void> {
    await this.one({ op: "lRem", key: scope, value: launch });
  }

  /** The pipeline outputs that have a value, decoded by their type. */
  async outputs(launch: Launch): Promise<Map<string, Primitive>> {
    const keys = [...(launch.pipeline.outputs?.keys() ?? [])];
    const values = (await this.store.exec(
      keys.map((key) => ({ op: "get", key: PIPELINE_OUTPUT(launch._id, key) }))
    )) as (string | null)[];
    const outputs = new Map<string, Primitive>();
    keys.forEach((key, i) => {
      if (values[i] !== null) {
        const { type } = launch.pipeline.outputs.get(key);
        outputs.set(key, fromRedisValue(type, values[i]));
      }
    });
    return outputs;
  }

  /** One pipeline output's value, or undefined while it has none. */
  async output(launch: Launch, key: string): Promise<Primitive | undefined> {
    const value = await this.one<string | null>({
      op: "get",
      key: PIPELINE_OUTPUT(launch._id, key),
    });
    return value === null
      ? undefined
      : fromRedisValue(launch.pipeline.outputs.get(key).type, value);
  }

  /** Stores the data shown for a pipeline output (plain, with its type). */
  async setOutputData(
    launch: string,
    key: string,
    data: object
  ): Promise<void> {
    await this.one(this.setJson(PIPELINE_OUTPUT_DATA(launch, key), data));
  }

  async outputData(launch: Launch): Promise<Map<string, object>> {
    const keys = [...(launch.pipeline.outputs?.keys() ?? [])];
    const values = (await this.store.exec(
      keys.map((key) => ({
        op: "get",
        key: PIPELINE_OUTPUT_DATA(launch._id, key),
      }))
    )) as (string | null)[];
    const data = new Map<string, object>();
    keys.forEach((key, i) => {
      if (values[i] !== null) {
        data.set(key, JSON.parse(values[i]) as object);
      }
    });
    return data;
  }

  /** The Launch's errors, a fatal one first. */
  async errors(launch: string): Promise<string[]> {
    return (
      (await this.one<string[]>({
        op: "lRange",
        key: PIPELINE_ERRORS(launch),
        start: 0,
        stop: -1,
      })) ?? []
    );
  }

  /** Whether every pipeline output the Launch waits for has a value. */
  async isFinished(launch: Launch): Promise<boolean> {
    return isFinished(launch.pipeline, await this.filledOutputs(launch));
  }

  private async filledOutputs(launch: Launch): Promise<Set<string>> {
    const required = requiredOutputs(launch.pipeline);
    const exists = await this.store.exec(
      required.map((key) => ({
        op: "exists",
        key: PIPELINE_OUTPUT(launch._id, key),
      }))
    );
    return new Set(required.filter((_, i) => exists[i] === 1));
  }

  /**
   * Marks the Launch's run as recorded with this status. Only the first call
   * wins: it returns true, every later one false.
   */
  async markRunRecorded(
    launch: string,
    status: LaunchRunStatus
  ): Promise<boolean> {
    const reply = await this.one({
      op: "set",
      key: LAUNCH_RUN_RECORDED(launch),
      value: status,
      ttl: LAUNCH_EXPIRED,
      nx: true,
    });
    return reply === "OK";
  }

  // ---- Node

  /** Remembers a queue job that ran the Node. */
  async addJob(launch: string, node: string, job: string): Promise<void> {
    const key = NODE_JOBS(launch, node);
    await this.store.exec([
      { op: "sAdd", key, member: job },
      { op: "expire", key, ttl: LAUNCH_EXPIRED },
    ]);
  }

  async jobs(launch: string, node: string): Promise<string[]> {
    return this.one({ op: "sMembers", key: NODE_JOBS(launch, node) });
  }

  /** Whether the Node is done and must not run again before a rerun. */
  async isProcessed(launch: string, node: string): Promise<boolean> {
    return !!(await this.one({
      op: "get",
      key: NODE_PROCESSED_LOCK(launch, node),
    }));
  }

  /** Whether another job runs the Node right now. */
  async isProcessing(launch: string, node: string): Promise<boolean> {
    return !!(await this.one({
      op: "get",
      key: NODE_PROCESSING_LOCK(launch, node),
    }));
  }

  async isFlowDone(launch: string, node: string, flow: string) {
    return !!(await this.one({
      op: "sIsMember",
      key: NODE_FLOWS(launch, node),
      member: flow,
    }));
  }

  /** The Node's inputs that have a value, decoded by their type. */
  async inputs(
    launch: string,
    node: string,
    config: Map<string, NodeInput>
  ): Promise<{ [key: string]: Primitive }> {
    const keys = [...config.keys()];
    const values = (await this.store.exec(
      keys.map((key) => ({ op: "get", key: NODE_INPUT(launch, node, key) }))
    )) as (string | null)[];
    const inputs: { [key: string]: Primitive } = {};
    keys.forEach((key, i) => {
      const value =
        values[i] !== null
          ? fromRedisValue(config.get(key).type, values[i])
          : null;
      if (value !== null) {
        inputs[key] = value;
      }
    });
    return inputs;
  }

  /** The state a repeating Node keeps between its runs. */
  async state(launch: string, node: string): Promise<object | null> {
    return this.readJson(NODE_STATE(launch, node));
  }

  async status(launch: string, node: string): Promise<object | null> {
    return this.readJson(NODE_STATUS(launch, node));
  }

  async progress(launch: string, node: string): Promise<object | null> {
    return this.readJson(NODE_PROGRESS(launch, node));
  }

  /** The Node's last converted outputs. */
  async nodeOutputs(
    launch: string,
    node: string
  ): Promise<{ [key: string]: Primitive } | null> {
    return (await this.readJson(NODE_OUTPUTS(launch, node))) as {
      [key: string]: Primitive;
    } | null;
  }

  /** When a delayed or retried job of the Node was due, in ms. */
  async dueAt(launch: string, node: string, job: string) {
    const due = await this.one<string | null>({
      op: "get",
      key: NODE_JOB_DUE(launch, node, job),
    });
    return due ? Number(due) : null;
  }

  /** The Child Launches the Node started, by the key its script gave each. */
  async children(
    launch: string,
    node: string
  ): Promise<Record<string, string> | null> {
    return (await this.readJson(NODE_CHILDREN(launch, node))) as Record<
      string,
      string
    > | null;
  }

  async setChildren(
    launch: string,
    node: string,
    children: Record<string, string>
  ): Promise<void> {
    await this.one(this.setJson(NODE_CHILDREN(launch, node), children));
  }

  /** The Node starts running: it is locked against other jobs. */
  async nodeStarted(launch: string, node: string): Promise<void> {
    await this.store.exec([
      {
        op: "set",
        key: NODE_PROCESSING_LOCK(launch, node),
        value: LOCKED,
        ttl: NODE_PROCESSING_TIMEOUT,
      },
      this.setJson(
        NODE_STATUS(launch, node),
        toPlain(new NodeStatus({ state: "running" }))
      ),
    ]);
  }

  /** The Node's run has ended, whatever its outcome. */
  async nodeStopped(launch: string, node: string): Promise<void> {
    await this.one({ op: "del", key: NODE_PROCESSING_LOCK(launch, node) });
  }

  /** The Node runs again later from this job, keeping its state. */
  async nodeRepeats(
    launch: string,
    node: string,
    job: string,
    {
      dueAt,
      state,
      progress,
    }: { dueAt: number; state?: object; progress?: object }
  ): Promise<void> {
    await this.store.exec([
      ...(state ? [this.setJson(NODE_STATE(launch, node), state)] : []),
      ...(progress
        ? [this.setJson(NODE_PROGRESS(launch, node), progress)]
        : []),
      {
        op: "set",
        key: NODE_JOB_DUE(launch, node, job),
        value: String(dueAt),
        ttl: LAUNCH_EXPIRED,
      },
    ]);
  }

  /**
   * The Node is done: its outputs, the Flows it fills and the pipeline outputs
   * it gives are written at once. Says whether this completion finished the
   * Launch: it gave a pipeline output and now every one it waits for has a
   * value.
   */
  async nodeCompleted(
    launch: Launch,
    node: string,
    completion: NodeCompletion
  ): Promise<{ finished: boolean }> {
    const { _id, pipeline } = launch;
    const {
      outputs,
      processed,
      resetInputs = [],
      inputs = [],
      flows = [],
      rerun = [],
      pipelineOutputs = {},
    } = completion;
    const given = Object.entries(pipelineOutputs);
    const required = given.length > 0 ? requiredOutputs(pipeline) : [];

    const commands: Command[] = [
      ...(outputs ? [this.setJson(NODE_OUTPUTS(_id, node), outputs)] : []),
      ...(processed
        ? [
            {
              op: "set",
              key: NODE_PROCESSED_LOCK(_id, node),
              value: LOCKED,
              ttl: LAUNCH_EXPIRED,
            } as Command,
          ]
        : []),
      ...resetInputs.map(
        (input): Command => ({ op: "del", key: NODE_INPUT(_id, node, input) })
      ),
      this.setJson(
        NODE_STATUS(_id, node),
        toPlain(new NodeStatus({ state: "done" }))
      ),
      ...inputs.map(
        ({ node: to, input, value }): Command => ({
          op: "set",
          key: NODE_INPUT(_id, to, input),
          value: toRedisValue(
            pipeline.nodes.get(to).inputs.get(input).type,
            value
          ),
          ttl: LAUNCH_EXPIRED,
        })
      ),
      ...flows.flatMap(({ node: to, flow }): Command[] => [
        { op: "sAdd", key: NODE_FLOWS(_id, to), member: flow },
        { op: "expire", key: NODE_FLOWS(_id, to), ttl: LAUNCH_EXPIRED },
      ]),
      ...rerun.flatMap((next): Command[] =>
        [NODE_STATUS, NODE_STATE, NODE_CHILDREN, NODE_PROGRESS].map((key) => ({
          op: "del",
          key: key(_id, next),
        }))
      ),
      ...rerun.map(
        (next): Command => ({ op: "del", key: NODE_PROCESSED_LOCK(_id, next) })
      ),
      ...given.map(
        ([key, value]): Command => ({
          op: "set",
          key: PIPELINE_OUTPUT(_id, key),
          value: toRedisValue(pipeline.outputs.get(key).type, value),
          ttl: LAUNCH_EXPIRED,
        })
      ),
      // read in the same batch, so two Nodes completing at once cannot both
      // miss the other's output
      ...required.map(
        (key): Command => ({ op: "exists", key: PIPELINE_OUTPUT(_id, key) })
      ),
    ];

    const replies = await this.store.exec(commands);
    if (given.length === 0) {
      return { finished: false };
    }
    const exists = replies.slice(replies.length - required.length);
    const filled = new Set(required.filter((_, i) => exists[i] === 1));
    return { finished: isFinished(pipeline, filled) };
  }

  /** The Node's attempt failed with this error. */
  async nodeFailed(
    launch: string,
    node: string,
    error: string,
    failure: NodeFailure
  ): Promise<void> {
    const status = this.setJson(
      NODE_STATUS(launch, node),
      toPlain(new NodeStatus({ state: "error", error }))
    );
    const errors = PIPELINE_ERRORS(launch);
    const effects: Command[] = (() => {
      switch (failure.outcome) {
        case "retry":
          return [
            {
              op: "set",
              key: NODE_JOB_DUE(launch, node, failure.job),
              value: String(failure.dueAt),
              ttl: LAUNCH_EXPIRED,
            },
          ];
        case "exhausted":
          return [
            { op: "rPush", key: errors, values: [error] },
            { op: "expire", key: errors, ttl: LAUNCH_EXPIRED },
          ];
        case "fatal":
          return [
            { op: "lPush", key: errors, values: [error] },
            { op: "expire", key: errors, ttl: LAUNCH_EXPIRED },
          ];
      }
    })();
    await this.store.exec([status, ...effects]);
  }

  /**
   * Appends Node Log lines and keeps only the newest NODE_LOGS_LIMIT, counting
   * the lines it drops.
   */
  async appendLogs(
    launch: string,
    node: string,
    lines: object[]
  ): Promise<void> {
    const key = NODE_LOGS(launch, node);
    const [length] = (await this.store.exec([
      { op: "rPush", key, values: lines.map((line) => JSON.stringify(line)) },
      { op: "expire", key, ttl: LAUNCH_EXPIRED },
    ])) as [number];

    const overflow = length - NODE_LOGS_LIMIT;
    if (overflow > 0) {
      const dropped = NODE_LOGS_DROPPED(launch, node);
      await this.store.exec([
        { op: "lTrim", key, start: -NODE_LOGS_LIMIT, stop: -1 },
        { op: "incrBy", key: dropped, by: overflow },
        { op: "expire", key: dropped, ttl: LAUNCH_EXPIRED },
      ]);
    }
  }

  /** The Node's log lines, oldest first, and how many were dropped. */
  async logs(
    launch: string,
    node: string
  ): Promise<{ lines: object[]; dropped: number }> {
    const [lines, dropped] = (await this.store.exec([
      { op: "lRange", key: NODE_LOGS(launch, node), start: 0, stop: -1 },
      { op: "get", key: NODE_LOGS_DROPPED(launch, node) },
    ])) as [string[], string | null];
    return {
      lines: (lines ?? []).map((line) => JSON.parse(line) as object),
      dropped: Number(dropped),
    };
  }

  /** Adds one invocation to the Node's open execution, opening it if needed. */
  async addInvocation(
    launch: string,
    node: string,
    { startedAt, finishedAt, waitMs, durationMs, attempt }: Invocation
  ): Promise<void> {
    const key = NODE_EXECUTION(launch, node);
    await this.store.exec([
      {
        op: "hSetNX",
        key,
        field: "startedAt",
        value: String(startedAt.getTime()),
      },
      { op: "hSetNX", key, field: "waitMs", value: String(waitMs) },
      { op: "hIncrBy", key, field: "activeMs", by: durationMs },
      { op: "hIncrBy", key, field: "invocations", by: 1 },
      {
        op: "hSet",
        key,
        fields: {
          attempts: String(attempt + 1),
          finishedAt: String(finishedAt),
        },
      },
      { op: "expire", key, ttl: LAUNCH_EXPIRED },
    ]);
  }

  /** Closes the Node's open execution and returns it, or null without one. */
  async closeExecution(
    launch: string,
    node: string
  ): Promise<OpenExecution | null> {
    const key = NODE_EXECUTION(launch, node);
    const [open] = (await this.store.exec([
      { op: "hGetAll", key },
      { op: "del", key },
    ])) as [Record<string, string>];
    if (!open?.startedAt) {
      return null;
    }
    return {
      startedAt: Number(open.startedAt),
      finishedAt: Number(open.finishedAt),
      waitMs: Number(open.waitMs),
      activeMs: Number(open.activeMs),
      invocations: Number(open.invocations),
      attempts: Number(open.attempts),
    };
  }
}
