# Node scripts start Child Launches by returning an instruction, not by calling Piper

A node script starts a Child Launch by returning `{ __type: "launch", launches: [...] }`. The node handler starts the launch inside the backend and puts each child's state into the next run's payload as `children`. We chose this over two alternatives: calling Piper's public HTTP API with a user's `api-token`, and handing the Deno sandbox a short-lived, launch-scoped token plus an internal API. Both would open a credentialed path from untrusted script code back into the backend, and neither could set `parent`, guard recursion or propagate failures. Returning an instruction keeps `piper-deno` a stateless function runner with no Piper credentials, and reuses the `next`/`repeat` result model. Children are tracked by a script-chosen key that is reserved before the launch starts, so a retried node never starts a second, paid child.

## Consequences

- The `run` result shape `{ __type: "launch" }` and the `children` payload field are now a contract with node scripts in `piper-nodes`.
- A parent finds out a child finished only by re-running after its `delay`. Waking it when the child completes would be an extra, later optimisation.
