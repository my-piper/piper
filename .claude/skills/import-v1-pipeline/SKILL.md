---
name: import-v1-pipeline
description: Port Piper v1 pipelines to current-format YAML whose nodes are catalog nodes or inline Script Nodes built on the core package.
argument-hint: <v1 pipeline .yaml>...
disable-model-invocation: true
---

Prepare `$ARGUMENTS` (default: `tmp/piper-v1/*.yaml`) as current-format YAMLs in
`tmp/piper-v1/prepared/<same name>`. Keep originals intact.

**Default scope is files only**: the prepared YAMLs, their authoring sources
and tests under `tmp/piper-v1/work/`, and a report. No node package is created.
Importing Projects, changing Environment values, launching and deploying
require the user to request those actions; owner confirmation alone authorizes
none of them. [delivery.md](delivery.md) covers them when requested.

Every node ends up as one of two kinds:

- **Catalog node** first. Point the node at an `artworks` catalog node
  (`source: node`, `package: artworks`, `script: registry:artworks@<N>/<node>/script.js`)
  when it submits the same task and payload, with the v1 inputs and defaults
  set on it. Known fits: Duo's `generate_image` → `qwen_edit_image`,
  `prompt_censor_enhancer` → `ask_llm_agent` (which sends `temperature`,
  default 1, where v1 sent none). Check fits as [delivery.md](delivery.md) says.
- **Inline Script Node** otherwise (`source: script`): the v1 script, rewritten,
  importing v1's helpers from the built-in **core** package
  (`"registry:core@1/node.js"`, ADR 0010). Record per node why the catalog
  can't reproduce it: a non-ArtWorks service (MuleRouter, Hive, Hal9, Clef,
  lgbm), a custom ffmpeg command, a payload field the catalog node doesn't
  expose (`baseModel`, `loras`, `numFrames`, per-run `priority` or `tags`),
  skip or fallback logic, a different output shape, or a longer polling budget.

Preserve behavior, graph topology and defaults while replacing unsupported v1
code. If the user explicitly requests byte-for-byte original scripts, describe
those files as unconverted; do not claim they are ready to run.

## 1. Establish the runtime and inventory

Read ADRs 0005, 0007, 0009 and 0010 in `docs/adr/` and
`backend/builtin-packages/core/1/node.js`, then inspect:

- `backend/packages/pipelines/import-pipeline.ts`: **regular Import** preserves
  inline scripts and declared Environment Variables.
- `backend/packages/pipelines/v1/adopt-nodes.ts` and `v1-script.ts`: **Import v1**
  replaces catalog nodes, drops Script Node Environment declarations and adds
  an empty Environment prelude. It is unsuitable for the output here.
- `backend/packages/registry/reference.ts`: the server resolves quoted
  `registry:` references in inline code to `REGISTRY_URL` before Deno loads it.

From `backend/`, inventory every source node:

```sh
node ../.claude/skills/import-v1-pipeline/classify.mjs ../tmp/piper-v1/*.yaml
```

Inspect custom scripts even when they carry a catalog `package` or `_id`: a
matching catalog name or compatible ports do not prove equivalent defaults,
model routing, payloads or outputs. Check which `artworks` version the target
registry serves (`GET <registry>/artworks/<N>/utils.js`) and pin that version.

Done when every node, module dependency, v1 global, Environment read and child
target has been accounted for. Keep credentials out of tool output and
generated code.

## 2. Rewrite every ported node as an inline Script Node

Write each node's script as a plain ES module in
`tmp/piper-v1/work/<pipeline>/<node>.js`, next to its tests, and apply **all**
rules in [rewrites.md](rewrites.md): v1 globals from core, `sharp`, native HTTP
and multipart, dynamic module loading, Environment names and access, and
obsolete notifications. Renaming Variables alone is incomplete.

A script's imports are exactly: `"registry:core@1/node.js"`,
`"registry:artworks@<N>/utils.js"` for the ArtWorks client, bare `"sharp"`,
`node:` builtins and pinned HTTPS URLs on hosts Deno allows. The script itself goes into the YAML as the node's `script`, with
`source: script`, without `isolated: true` (its process has no registry token
and no native code). Remove catalog identity (`catalog`, `_id`, `sign`,
`package`) and obsolete billing metadata. Retain `environment` declarations
with type/description and current names. Convert `nested.run/state` to Child
Launch instructions with core's `createNested`, keeping child bookkeeping local
to each invocation.

Done when every script runs without CommonJS `require`, v1 global injection,
Map-style Environment access, an empty Environment stand-in or a copied helper.

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
connected ports, enum defaults, the allowed imports and isolation, and
Environment rewrites. Schema acceptance alone is not the completion criterion.

Compare parsed original/prepared graph endpoints and defaults. Exercise the
exact scripts the YAML carries, not authoring fragments, with `deno test`:
copy each script with its quoted `registry:<pkg>@<N>/` references rewritten to
the registry URL (as the server does), map `sharp` to `npm:sharp@<piper-deno's
version>` in an import map, and pass `DENO_AUTH_TOKENS` for the registry host.
Mock HTTP and test submission, polling/completion, error/skip branches, child
instructions and Environment forwarding. Run `deno test` from the work folder
and delete any `deno.lock` or `node_modules` it leaves at the repo root.

Then load every script in a running piper-deno through the backend's
`execute()` (`packages/deno/execute.ts`, Worker isolation), with `REGISTRY_URL`
pointing at a registry that serves `core`. A module-load check or missing-key
guard proves loading, not successful generation.

Done when the guard passes for every file, graph comparisons pass, and focused
behavior checks pass. State skipped runtime checks and unresolved dependencies.
These checks must not call Project creation, publishing or deployment APIs.

## 5. Deliver files and instructions

Report the prepared YAML paths, **regular Import** as the required entrypoint,
node/connection counts, the `core` and `artworks` versions each file imports,
applied behavior changes, and validation evidence. List declared Variable
names, optional defaults and needed Global bindings or Project overrides
without values. Note missing child deploys and callee-first configuration and
deployment order. State the runtime each file needs: a registry serving the
`core` version it imports, and a piper-deno with Sharp for any node using it.

For the local ArtWorks setup, check whether `ARTWORKS_URL` needs binding to a
Global name such as `ARTWORKS_PAAS_BASE_URL`; renaming a script does not create
a Global value. Externalize embedded credentials into declared Variables.

Keep the README and machine-readable validation records consistent with the
final YAMLs. State which external actions, if any, were explicitly requested
and performed. A generated file does not update an already imported Project.
