---
name: import-v1-pipeline
description: Bring Piper v1 Pipeline YAMLs into this Piper - classify their Nodes, move secret-reading ones into a Node Package, rewrite v1-only code, then import through Import v1.
argument-hint: <v1 pipeline .yaml>...
disable-model-invocation: true
---

Import the Piper v1 Pipelines in `$ARGUMENTS` (default: every `tmp/piper-v1/*.yaml`).
The importer `POST /api/pipelines/import/v1` (`backend/packages/pipelines/v1/`)
stays the one structural converter: this skill only prepares a **cleaned** copy
of each YAML so that the import comes back without problems and without
`require`/Environment warnings. Read `docs/adr/0004-script-nodes-run-unsigned-and-isolated.md`
and `0005-v1-scripts-imported-behind-a-prelude.md` first: they decide where each
Node can land. ADR 0007 has since let Script Nodes read an Environment, but the
v1 importer still drops a Script Node's `environment`, so the rules below hold.

## 1. Classify every Node

From `backend/`:

```sh
node ../.claude/skills/import-v1-pipeline/classify.mjs ../tmp/piper-v1/*.yaml
```

One line per Node: `package <pkg>/<id>` or `user`, the modules it `require`s,
the Environment Variables it reads or declares, flags (`n8n`, `nested`,
`dynamic-require`, `message`) and `same-script` copies in other pipelines.
Give each Node one **destination**:

- **Catalog**: a `package` Node. The importer replaces it with the installed
  Node Definition (by `_id`, then key, then ports), whatever its v1 script
  required or read. Confirm the Definition is installed (`mongo.nodes`, or the
  catalog in the UI); a `package` Node whose Definition is missing becomes a
  user Node below.
- **Package Node**: a user Node that reads the Environment (secrets such as
  `OPEN_PAAS_*`, `MULEROUTER_API_KEY`, `HIVE_KEY`, `LGBM_URL`,
  `OPENROUTER_API_KEY`) or has a `same-script` copy. A Script Node never reads
  an Environment (ADR 0004), so these need reviewed code. Reach first for an
  existing piper-nodes Node that does the job (`../piper-nodes/nodes/artworks/*`
  and the rest); write a new one only when none fits.
- **Script Node**: everything else, user glue that needs no secret. It keeps
  its v1 code behind the importer's prelude; only the parts below get rewritten.

Done when every Node of every pipeline has a destination and every Environment
Variable read by a Script Node is gone from its script.

## 2. Rewrite the code

Apply [rewrites.md](rewrites.md) to every Script Node and every new Package
Node: n8n removal, `sharp`, `form-data`, `openai`, `artworks`, dynamic
`require`, Environment names. Done when no script in the cleaned YAML or the
package calls `require(`, and no script names an n8n host.

## 3. Publish the Package Nodes

All new Package Nodes go into one shared Node Package, `v1_pipelines`, in
`../piper-nodes/nodes/v1_pipelines/`: a `package.yaml` manifest (`_id`,
positive integer `version`, `title`, `description`) and one folder per Node
with `schema.yaml` and `script.js` (plus `test.js`), the layout
`backend/packages/node-packages/archive.ts` reads. Dispatch the
`node-package-author` subagent per Node with its v1 script, its destination
ports and the rewrite rules.

The archive is self-contained: every relative import must stay inside the
package folder, so copy the helpers a Node needs (`utils/node.js`, the
`ArtWorks` client from `nodes/artworks/utils.js`) into
`v1_pipelines/_lib/`. Remote imports must be pinned versions.

Zip the folder and upload it as an admin:
`POST /api/node-packages/actions/upload-archive` (multipart `file`). Each
re-upload needs a greater `version` (ADR 0003). Done when the upload answers
`200` listing every new Node id.

## 4. Write the cleaned YAML

Copy each v1 YAML to `tmp/piper-v1/cleaned/<same name>` and in it:

- point each Package Node at its Definition: `package: v1_pipelines` (or the
  existing package) and `_id: <node id>`, keeping its key, `arrange` and
  every port its Flows use;
- replace each Script Node's `script` with the rewritten code and delete its
  `environment` (a `sign` is dropped anyway);
- leave Flows, inputs, outputs and `start` untouched.

## 5. Import, children first

A Node that calls `nested.run(<slug>)` runs another Deploy as a Child Launch
(ADR 0005). Map every slug the batch calls (a literal, or the `default` of the
input that feeds it, such as `endpoint`) against each pipeline's own
`deploy.slug` and the Deploys already live here. Import and deploy callees
before callers. Repoint every call to an older `violations-detector-v*` at
`violations-detector-v5`, the one Violations pipeline imported, in the
cleaned YAML (literal or input `default`), and check that each input the
caller passes is an input of Violations On Image V5. Any other called slug
that is neither in the batch nor live is a question for the user. Then import
each cleaned YAML with an admin `user-token`:

```sh
curl -s -X POST http://localhost/api/pipelines/import/v1 \
  -H "user-token: $TOKEN" -H 'Content-Type: application/json' \
  --data "$(jq -Rs '{yaml: .}' 'tmp/piper-v1/cleaned/<name>.yaml')"
```

Done when every import answers the new Project and its `warnings` hold only
ports-adoption notes you have checked. A `require`, Environment or `message()`
warning means a Node went back to step 2. A `400 Pipeline can't be imported`
lists its problems in `details`: fix the cleaned YAML or the package and
import again.

## 6. Report

Per pipeline: the new Project id, each Node's destination, the Package Nodes
published (package version), every behaviour change the rewrites made (the
list `rewrites.md` asks you to record), and anything still left for a person,
such as Environment Variables to set under their new names. A rewrite rule
you applied in more than one pipeline is a candidate for the importer itself:
name it.
