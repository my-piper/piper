# Optional catalog and package workflow

Read this branch when the user requests catalog reuse or package publication.
For inline, file-only preparation, use the main skill instead.

A v1 package label does not prove that its installed Node Definition preserves
custom behavior. Check the installed script, all used ports, original defaults,
outputs, model dispatch and Environment rules before adopting it. Fixing a
catalog definition can affect other Projects; keep a custom inline node when
that shared change is outside the user's request.

New package nodes belong together in `v1_pipelines`, normally under the sibling
`../piper-nodes/nodes/v1_pipelines/`. Respect the session's writable roots; stage
the complete source in an authorized directory if the sibling is read-only.
The archive layout is defined by `backend/packages/node-packages/archive.ts`:
`package.yaml` declares `_id`, a positive integer version, title and description;
each node folder contains `schema.yaml`, `script.js` and behavior tests. Schemas
come from `backend/schemas/node.json` and `node-package.json`.

Copy required helpers into the archive and pin remote imports. All relative
imports stay inside the archive. Adapt scripts with [rewrites.md](rewrites.md).
Registry scripts cannot run with process isolation; check ADRs 0003 and 0007.
Validate schemas, archive boundaries and mocked runtime behavior before upload.

If publication was requested, upload the archive through
`POST /api/node-packages/actions/upload-archive` as an admin. Each upload needs
a greater version; published registry versions are immutable. Record the exact
version and node ids returned. Package creation does not authorize Project
imports, launches, deployment or Environment edits.

Choose the eventual import entrypoint from the output format:

- Current-format YAML with complete inline or published scripts uses regular
  Import (`POST /api/pipelines/import`). It preserves declared Environment.
- Import v1 (`POST /api/pipelines/import/v1`) is only for output deliberately
  relying on its catalog adoption and compatibility prelude. Any remaining
  Script Node Environment reads lose their declarations there. Resolve that
  mismatch before handing the file to the user.

If Project import was requested, confirm the intended importing account: the
new private Project belongs to the authenticated user, not the original YAML
writer. If deployment was requested, configure required Environment values,
resolve child targets and deploy callees before callers. A Deploy freezes
Project overrides and binding targets and reads Global values at launch
(ADR 0009); credentials are not supplied by callers. Report unset Variables as
blocking deployment and never print their values.
