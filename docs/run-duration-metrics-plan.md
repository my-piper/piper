# Run duration metrics plan

**Status (2026-10-30): implemented** (helpers in
`backend/jobs/process-node/run-metrics.ts`, migrations `000007_node_runs` and
`000008_launch_runs`). Decisions made during implementation:

- `project` is `project._id`; `pipeline` is `pipeline.name`.
- `waitMs` is measured up to the start of the script. The first run waits from
  `job.timestamp + opts.delay`. Repeats and retries store their due time in
  `NODE_JOB_DUE` (`launch:<id>:nodes:<node>:jobs:<job>:due`), so a retry's wait
  includes the BullMQ backoff.
- `attempt` is BullMQ `attemptsMade` (0 for the first attempt), the same as in
  `pipeline_errors`.
- Each launch gets at most one `launch_runs` row: the first outcome claims
  `LAUNCH_RUN_RECORDED` with `SET NX`.
- `interrupted` is recorded by the next node job that sees the interrupt flag,
  with the interrupt time as `finishedAt`. The API server has no Kafka producer.
  A launch interrupted when no node job runs afterwards gets no row.
- An unscoped launch gets `startedAt = launchedAt` at creation. A scoped launch
  gets it in `kick()`, saved with `KEEPTTL`.

Goal: collect statistics on pipeline (launch) and node run durations — wait
time, execution time, repeats, retries and outcome — in ClickHouse, so they can
be aggregated by project, pipeline, node and execution type (for example in a
Grafana dashboard).

## Current state

| Source | What it holds |
|---|---|
| `/metrics` (`backend/metrics.ts`) | BullMQ queue counters only. No timings. |
| `pipeline_metrics_finished` | `launch, finishedAt, fromStart`: seconds from launch until the last pipeline output is filled. Sent from `jobs/process-node/complete-node.ts`. |
| `pipeline_metrics_outputs` | `launch, output, filledAt, fromStart`: the same, per output. Sent from `complete-node.ts`. |
| `pipeline_errors` | One row per failed attempt, without a duration. |
| `pipeline_usages` | Costs only. |

Streams are declared in `backend/app/streams.ts`; each ClickHouse table is fed
by a `*_consumer` Kafka table and a materialized view
(`migrations/clickhouse/00000*`).

## Gaps

1. **No node timing.** The Deno call in
   `jobs/process-node/process-node-handler.ts` (`execute(...)`) is not timed.
   Queue wait time, the number of repeats and retry attempts are not recorded.
2. **No fields to group by.** The metric tables only carry `launch`. Getting
   statistics per project, pipeline, node, execution type or user would need a
   join against Mongo for every launch.
3. **Only successful runs are counted.** "Finished" is emitted only when every
   pipeline output is filled. Failed, interrupted and output-less pipelines get
   no row, so the numbers lean towards successful runs.
4. **Scope queue wait is invisible.** `Launch.startedAt` exists but is never
   set. `jobs/run-launch.ts` can hold a launch back for minutes, and that time
   is counted as run time.
5. **Field types and sort keys.**
   - `fromStart UInt16` holds whole seconds and overflows after about 18 hours.
   - `DateTime` is second-resolution, too coarse for `rapid` nodes (3 s
     timeout).
   - The tables are sorted only by time, yet the API looks rows up by `launch`,
     so every lookup scans whole partitions.

## Design

Follow the existing pattern: a stream in `app/streams.ts` with a model in
`models/`, then a `*_consumer` Kafka table, then a materialized view into a
MergeTree table. Connect the new streams in `worker.ts` next to the others.

### `node_runs`

One row per execution of the node script, including each repeat and retry.

```sql
CREATE TABLE node_runs (
  startedAt   DateTime64(3),
  launch      String,
  project     String,
  pipeline    String,
  node        String,
  launchedBy  String,
  execution   LowCardinality(String),  -- rapid|regular|deferred|protracted
  attempt     UInt16,
  result      LowCardinality(String),  -- done|repeat|error|timeout|memory
  waitMs      UInt32,                  -- BullMQ: processedOn - (timestamp + delay)
  durationMs  UInt32                   -- Deno execute wall time
) ENGINE = MergeTree PARTITION BY toYYYYMM(startedAt)
ORDER BY (project, pipeline, node, startedAt)
TTL toDateTime(startedAt) + INTERVAL 12 MONTH;
```

- **Where it's emitted:** in `process-node-handler.ts`. Time the `execute`
  call, then send `repeat` or `done` once the result is classified, or the
  error type (`error`, `timeout` for `TimeoutError`, `memory` for
  `MemoryLimitError`) in the catch block.
- **Wait time:** from the BullMQ `job` fields (`timestamp`, `processedOn`,
  `opts.delay`).

### `launch_runs`

One row per launch when it ends, whatever the outcome.

```sql
CREATE TABLE launch_runs (
  launchedAt  DateTime64(3),
  startedAt   DateTime64(3),          -- set in kick()
  finishedAt  DateTime64(3),
  launch      String,
  project     String,
  pipeline    String,
  launchedBy  String,
  scope       String,
  status      LowCardinality(String), -- done|error|interrupted
  queuedMs    UInt32,                 -- startedAt - launchedAt
  durationMs  UInt32                  -- finishedAt - startedAt
) ENGINE = MergeTree PARTITION BY toYYYYMM(launchedAt)
ORDER BY (project, pipeline, launchedAt);
```

- **Where it's emitted:**
  - `done`: next to the existing "finished" send in `complete-node.ts`.
  - `error`: in `jobs/process-node/process-node-error.ts`, when attempts are
    exhausted or on a fatal error.
  - `interrupted`: where `LAUNCH_INTERRUPTED` is set.
- **Setting `startedAt`:** set it in `kick()` (`packages/launches/launching.ts`)
  and save it to the launch in Redis.

### Example query

```sql
-- p50/p95 per node over the last 7 days
SELECT pipeline, node, count() runs,
       quantiles(0.5, 0.95)(durationMs) dur, quantile(0.95)(waitMs) wait95,
       countIf(result IN ('error','timeout')) / count() err_rate
FROM node_runs WHERE startedAt > now() - INTERVAL 7 DAY
GROUP BY pipeline, node ORDER BY dur[2] DESC;
```

## What stays as it is

- Keep `pipeline_metrics_finished` and `pipeline_metrics_outputs`, because the
  frontend uses them (`frontend/src/pipes/pipeline-finished-metric.ts`). Later,
  `finished` could be replaced by a view over `launch_runs`.
- Duration histograms in `/metrics` are optional; ClickHouse plus a Grafana
  dashboard covers the statistics.

## Open decisions

- **Pipeline identity:** projects and pipelines are only identified by title
  now, as in `pipeline_usages`. Prefer the stable `project._id`.
- **Nodes that never finish:** a node killed together with its worker has no
  row in `node_runs`.
- **Abandoned launches:** a launch that stalls and loses its heartbeat never
  reaches `done`, `error` or `interrupted`, so it gets no `launch_runs` row.
  Covering those would need a periodic sweep (`periodic/`).

## Implementation checklist

1. Models `NodeRun` and `LaunchRun` in `backend/models/`.
2. Streams `pipeline.runs.nodes` and `pipeline.runs.launches` in
   `app/streams.ts`; connect them in `worker.ts`.
3. Two ClickHouse migrations (`make clickhouse-migrate-add`).
4. Set `startedAt` in `kick()`.
5. Emit events in `process-node-handler.ts`, `complete-node.ts`,
   `process-node-error.ts` and the interrupt path.
6. Unit tests for the emitted payloads (`backend/tests/unit/jobs`).
