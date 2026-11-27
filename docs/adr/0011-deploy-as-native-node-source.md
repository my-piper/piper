# A Deploy is a native Node source, run by the backend without a script

A Node with `source: "deploy"` and `deploy: { prefix, slug }` runs that Deploy as a Child Launch and has no `script`. Its `inputs` and `outputs` are copies of the Deploy pipeline's `inputs` and `outputs`, made when the user picks the Deploy, so the Pipeline stays self-contained and validates against the existing schemas. The backend handles the Node itself: it starts one child with the Node's inputs as the launch request's pipeline `inputs`, re-runs the Node until the child finishes, and then emits the child's pipeline outputs as the Node's outputs.

Calling a Deploy used to mean a script that built the Child Launch instruction of ADR 0001 by hand: `createNested` from `core@1`, `nested.run` keys replayed on every run, `payload.children`, and a returned `{ __type: "launch" }`. All the real work (starting, tracking, failing, interrupting) was already in the backend, so the script only translated inputs into an instruction and outputs back. A declarative Node removes that translation for the common case: run one Deploy, use its outputs.

## Considered Options

- **A script node in the `core` package** (`registry:core@2/run-deploy.js`) reading the Deploy from a hidden input. It needs no new source, but every poll would be a Deno round-trip that only returns an instruction, and the Deploy reference would hide in an input instead of the spec.
- **A simpler scripted API** in place of `createNested`. Still a script to write and read for a case that needs none; it remains a separate question for fan-out and choosing a Deploy at runtime.

## Consequences

- `source: "deploy"` requires `deploy` and forbids `script`, and no other source may carry `deploy` (`schemas/node.json`).
- The Node follows the Child Launch rules unchanged: the child runs as the parent's `launchedBy`, depth is limited, a Deploy sharing the parent's activated scope is refused, interrupts propagate, and a failed child fails the Node without retries.
- The Node runs the Deploy's current version; nothing is pinned. When the Deploy's inputs or outputs change, the copied sockets can drift: the editor offers to refresh them, and a run whose required inputs no longer match fails.
- `createNested` stays frozen in `core@1` (ADR 0010), and the v1 prelude (ADR 0005) keeps using Child Launches as before.
