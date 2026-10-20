---
name: add-queue
description: Scaffold a new BullMQ queue in the Piper backend (job model, queue declaration, handler, worker registration, test stub).
argument-hint: <queue_id> [short purpose]
disable-model-invocation: true
---

Add a new background queue named `$ARGUMENTS` to the backend. The first word
is the queue/worker id in `snake_case`; the rest describes what the job does.
If no id was given, ask for one.

Follow the existing pattern exactly, using `set_launch_errors` or
`record_pipeline_usage` as the reference implementation. Read both end to end
before writing.

1. **Job model:** `backend/models/jobs/<kebab-name>-job.ts`. A class whose
   fields all have `@Expose()`, with `@Type(() => X)` for nested objects and
   dates. Match the neighbouring job models.
2. **Queue:** in `backend/app/queues.ts`, add
   `new JobsQueue("<queue_id>", <Model>Job, { ... })` under the matching
   namespace. Set `concurrency`, `limiter` and `timeout` only if the purpose
   calls for them, and say which values you chose and why.
3. **Handler:** `backend/jobs/<kebab-name>.ts`. Calls
   `queues.<path>.process(async (job) => { ... })` as an import side effect,
   with the same logging and error style as the reference handler.
4. **Worker:** in `backend/worker.ts`, add a `Workers` map entry keyed by
   `<queue_id>` with
   `queues: new Map([["<queue_id>", { queue: queues.<path>, loader: () => import("./jobs/<kebab-name>") }]])`.
5. **Producer:** if the purpose names where the job is planned, add the
   `.plan(...)` call there with an instance of the job model.
6. **Test:** add `backend/tests/unit/jobs/<kebab-name>.test.ts` using
   `tests/helpers/job-boundaries.ts`, following `backend/tests/README.md`.
   Cover the success path and one failure.

Then run, from `backend/` on Node 22:

```sh
npx vitest run tests/unit/jobs/<kebab-name>.test.ts
npm run test:typecheck
```

Finish by showing how to start just this worker:
`npm run worker -- -w <queue_id>`.
