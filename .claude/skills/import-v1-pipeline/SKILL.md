---
name: import-v1-pipeline
description: Prepare Piper v1 pipelines as self-contained YAML files for the current Piper importer.
argument-hint: <v1 pipeline .yaml>...
disable-model-invocation: true
---

Prepare `$ARGUMENTS` (default: `tmp/piper-v1/*.yaml`) as current-format YAMLs in
`tmp/piper-v1/prepared/<same name>`. Keep originals intact.

**Default scope is files only.** Produce inline Script Nodes and a report.
Publishing packages, importing Projects, changing Environment values, launching
and deploying require the user to request those actions. Owner confirmation
alone authorizes none of them. If the user requests packages or catalog reuse,
read [packages.md](packages.md) for that branch.

“Without packages” changes the packaging, not the required runtime rewrites.
Preserve behavior, graph topology and defaults while replacing unsupported v1
code. If the user explicitly requests byte-for-byte original scripts, describe
those files as unconverted; do not claim they are ready to run.

## 1. Establish the runtime and inventory

Read ADRs 0005, 0007, 0008 and 0009 in `docs/adr/`, then inspect:

- `backend/packages/pipelines/import-pipeline.ts`: **regular Import** preserves
  inline scripts and declared Environment Variables.
- `backend/packages/pipelines/v1/adopt-nodes.ts` and `v1-script.ts`: **Import v1**
  replaces catalog nodes, drops Script Node Environment declarations and adds
  an empty Environment prelude. It is unsuitable for the inline output here.
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

## 2. Rewrite every node inline

Apply **all** rules in [rewrites.md](rewrites.md), including native HTTP and
multipart, image codecs, dynamic module loading, Environment names and access,
and obsolete notifications. Renaming Variables alone is incomplete.

Use `source: script`. Remove catalog identity (`package`, `catalog`, `_id`,
`sign`) and obsolete billing metadata. Keep script code inline and retain its
`environment` declarations, with type/description and current names.
Every Environment-reading function receives `env` from its invocation;
helpers receive it explicitly. Script Nodes can read the Environment through
regular Import (ADR 0007).

Embed or bundle local helpers into each script. External imports must be
pinned URLs supported by Deno or supported builtins. A self-contained YAML
cannot depend on a scratch directory, a sibling checkout or a registry upload.
Match the original ArtWorks create/poll/cancel return contracts when adapting
its client. Replace legacy globals with native result/error/HTTP helpers.
Convert `nested.run/state` to Child Launch instructions; keep child bookkeeping
local to each invocation so concurrent runs cannot overwrite it.

Done when every rewritten script can run without CommonJS `require`, v1 global
injection, Map-style Environment access or an empty Environment stand-in.

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
connected ports, inline scripts, module imports and Environment rewrites.
Its regression tests run in the existing backend fast-test CI job. Schema
acceptance alone is not the completion criterion.

Compare parsed original/prepared graph endpoints and defaults. Exercise the
exact scripts embedded in the YAML, not just authoring fragments: mock HTTP
and test submission, polling/completion, error/skip branches, child instructions
and Environment forwarding. Use the running Deno sandbox for harmless module
loads or mocked execution when available. A module-load check or missing-key
guard proves loading, not successful generation.

Done when the guard passes for every file, graph comparisons pass, and focused
behavior checks pass. State skipped runtime checks and unresolved dependencies.
These checks must not call Project creation, publishing or deployment APIs.

## 5. Deliver files and instructions

Report the prepared YAML paths, **regular Import** as the required entrypoint,
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
