---
name: import-v1-pipeline
description: Port Piper v1 pipelines to catalog nodes and package nodes in the nodes catalog, and prepare current-format YAML files that use them.
argument-hint: <v1 pipeline .yaml>...
disable-model-invocation: true
---

Prepare `$ARGUMENTS` (default: `tmp/piper-v1/*.yaml`) as current-format YAMLs in
`tmp/piper-v1/prepared/<same name>`. Keep originals intact.

**Default scope is files only.** Write each ported node as a package node in
`$PIPER_NODES_DIR/nodes/v1_pipelines/` (the `realistic-ai/piper/nodes` catalog),
the prepared YAMLs that reference it, and
a report. Read [packages.md](packages.md) for the package layout. Publishing
packages, importing Projects, changing Environment values, launching and
deploying require the user to request those actions. Owner confirmation alone
authorizes none of them.

Inline Script Nodes are the exception: use one only for a node that needs no
shared helper, or when the user asks for output without packages. An inline
node may still import the published artworks package's helpers by quoted
`registry:artworks@<N>/…` reference (see [rewrites.md](rewrites.md)). That
changes the packaging, not the required runtime rewrites.

**Reuse a catalog node first.** Point the pipeline at an `artworks` node
(`source: node`, `package: artworks`, `script: registry:artworks@<N>/<node>/script.js`)
when it submits the same task and payload, with the v1 inputs and defaults set
on it. Port a node only when the catalog node can't reproduce it, and record
the concrete reason per node in the report. Known fits: Duo's `generate_image`
→ `qwen_edit_image`, `prompt_censor_enhancer` → `ask_llm_agent`. Recurring
reasons to port: a non-ArtWorks service (MuleRouter, Hive, Hal9, Clef, lgbm),
a custom ffmpeg command, a payload field the catalog node doesn't expose
(`baseModel`, `loras`, `numFrames`, per-run `priority` or `tags`), skip or
fallback logic, a different output shape, or a longer polling budget.
`ask_llm_agent` sends `temperature` (default 1) where v1 sent none.
Preserve behavior, graph topology and defaults while replacing unsupported v1
code. If the user explicitly requests byte-for-byte original scripts, describe
those files as unconverted; do not claim they are ready to run.

## 1. Establish the runtime and inventory

Read ADRs 0005, 0007, 0008 and 0009 in `docs/adr/`, then inspect:

- `backend/packages/pipelines/import-pipeline.ts`: **regular Import** preserves
  inline scripts and declared Environment Variables.
- `backend/packages/pipelines/v1/adopt-nodes.ts` and `v1-script.ts`: **Import v1**
  replaces catalog nodes, drops Script Node Environment declarations and adds
  an empty Environment prelude. It is unsuitable for the output here.
- `backend/packages/deno/execute.ts` and `jobs/process-node/environment.ts`:
  scripts receive their Environment through the invocation payload.

From `backend/`, inventory every source node:

```sh
node ../.claude/skills/import-v1-pipeline/classify.mjs ../tmp/piper-v1/*.yaml
```

Inspect custom scripts even when they carry a catalog `package` or `_id`.
A matching catalog name or compatible ports do not prove equivalent defaults,
model routing, payloads or outputs. Repeated scripts may share preparation
helpers; they do not require published nodes.

Done when every node, module dependency, Environment read and child target has
been accounted for. Keep credentials out of tool output and generated code.

## 2. Rewrite every node as a package node

Apply **all** rules in [rewrites.md](rewrites.md), including native HTTP and
multipart, image codecs, dynamic module loading, Environment names and access,
and obsolete notifications. Renaming Variables alone is incomplete.

Write each node's `script.js`, `schema.yaml` and `test.js` under
`$PIPER_NODES_DIR/nodes/v1_pipelines/<node>/`. Import the shared helpers the way
the catalog's own nodes do, never a copy of their code:

```js
import { next, repeat, FatalError } from "../../../utils/node.js";
import { ArtWorks } from "../../artworks/utils.js";
```

`make pack` copies them to the archive root, so the published script
imports `../node.js` and `../utils.js`. Don't add a runtime prelude, a
`DEFINITIONS` object or a local `_lib/` copy: `NextNode.from(x)` becomes
`next(x)`, and errors are the `node.js` classes.

In the prepared YAML, each such node is `source: node`, `package: v1_pipelines`
and `script: registry:v1_pipelines@<N>/<node>/script.js`, where `<N>` is the
package version; its own `version`, inputs, outputs and `environment` come from
its `schema.yaml`. Leave out `isolated: true`: a registry script can't load
under process isolation (ADR 0007). Remove catalog identity
(`catalog`, `_id`, `sign`) and obsolete billing metadata. Retain `environment`
declarations, with type/description and current names.
Every Environment-reading function receives `env` from its invocation;
helpers receive it explicitly. Script Nodes can read the Environment through
regular Import (ADR 0007).

Relative imports may only reach files of the catalog; external imports must
be pinned URLs supported by Deno or supported builtins. A prepared YAML depends
on `v1_pipelines@<N>` being published where it is imported; report that.
Match the original ArtWorks create/poll/cancel return contracts when adapting
its client (see [rewrites.md](rewrites.md)). Replace legacy globals with native result/error/HTTP helpers.
Convert `nested.run/state` to Child Launch instructions; keep child bookkeeping
local to each invocation so concurrent runs cannot overwrite it.

Done when every rewritten script can run without CommonJS `require`, v1 global
injection, Map-style Environment access, an empty Environment stand-in or a
copied helper.

## 3. Preserve the graph and editor behavior

Keep original node keys, positions, used ports, flows, pipeline inputs/outputs,
start nodes and defaults. Add declarations for ports the original script
already used if needed; record those repairs.

Normalize these editor contracts in the prepared files:

- Include complete `layout.left` and `layout.top`, with `zoom` when needed.
  Use the new-project template in `frontend/src/app/projects/projects.component.ts`
  for defaults. An absent layout passes the schema but a first zoom save can
  create an invalid zoom-only layout.
- Set `featured: true` on **every connected node input**, including inputs
  reached from pipeline inputs. `frontend/src/services/project.manager.ts`
  removes links to non-featured inputs; `frontend/src/pipes/node.ts` omits their
  port positions. Regular Import does not perform v1's port adoption. The
  existing contract is tested in
  `frontend/tests/unit/services/project-manager.sanitize.spec.ts`.
- Write an enum input's `default` as the bare value (`auto`), never the
  whole `value|label` option v1 stored: the default reaches the script as it
  is, and the script's own validation rejects the label.
- Remove unsupported v1 metadata only when schema validation identifies it.
  Replacing code must not drop flows or change their endpoints.

Map literal and input-default child slugs against the batch. For this batch,
repoint older `violations-detector-v*` targets to `violations-detector-v5` and
check the supplied input names against V5. Preserve other unresolved slugs and
report them as runtime dependencies; do not invent replacement targets.

Done when all original connections remain and every endpoint resolves to a
rendered port, including after editor cleanup.

## 4. Validate the exact deliverables

From `backend/`, run the read-only guard against **every output file**:

```sh
node --import=tsx tools/validate-prepared-pipelines.ts ../tmp/piper-v1/prepared/*.yaml
```

The guard checks the production schema, model round trip, first zoom save,
connected ports, enum defaults, module imports and Environment rewrites. It
checks inline scripts in the YAML and package node scripts in the catalog
(`$PIPER_NODES_DIR/nodes/<package>/<node>/script.js`; unset, it fails),
and that each package node loads a script of its own package.
Its regression tests run in the existing backend fast-test CI job. Schema
acceptance alone is not the completion criterion.

From `$PIPER_NODES_DIR`, run the package's tests and pack it into
`dist/v1_pipelines-<N>.zip`; packing fails on a missing import or a helper
whose name clashes with an archive file:

```sh
deno test nodes/v1_pipelines nodes/artworks/utils.test.js --allow-net --allow-read --allow-env --allow-write --no-check --sloppy-imports
make pack PACKAGE=v1_pipelines
```

Bump `version` in `nodes/v1_pipelines/package.yaml` whenever its code changes
after an upload: a published version never changes (ADR 0003). Packing sets
each node's `version` to the package version.

Compare parsed original/prepared graph endpoints and defaults. Exercise the
exact scripts the YAML runs, not just authoring fragments: mock HTTP
and test submission, polling/completion, error/skip branches, child instructions
and Environment forwarding. Use the running Deno sandbox for harmless module
loads or mocked execution when available. A module-load check or missing-key
guard proves loading, not successful generation.

Done when the guard passes for every file, graph comparisons pass, and focused
behavior checks pass. State skipped runtime checks and unresolved dependencies.
These checks must not call Project creation, publishing or deployment APIs.

## 5. Deliver files and instructions

Report the prepared YAML paths, the `v1_pipelines` version they need and the
packed archive, **regular Import** as the required entrypoint,
node/connection counts, applied behavior changes, and validation evidence.
List declared Variable names, optional defaults and needed Global bindings or
Project overrides without values. Note missing child deploys and callee-first
configuration/deployment order for later use.

For the local ArtWorks setup, check whether `ARTWORKS_URL` needs binding to a
Global name such as `ARTWORKS_PAAS_BASE_URL`; do not assume renaming a script
creates a Global value. Externalize embedded credentials into declared Variables.

Keep README and machine-readable validation records consistent with the final
YAMLs. State which external actions, if any, were explicitly requested and
performed. A generated file does not update an already imported Project.
