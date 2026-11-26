# Catalog fits and delivery

## Choosing a catalog node

A v1 package label does not prove that its installed Node Definition preserves
custom behavior. Check the installed script, all used ports, original defaults,
outputs, model dispatch and Environment rules before adopting it. Fixing a
catalog definition can affect other Projects; keep an inline Script Node when
that shared change is outside the user's request.

## Import entrypoint

Current-format YAML with inline scripts and catalog nodes uses regular Import
(`POST /api/pipelines/import`, **Projects → Import**), which preserves declared
Environment. Import v1 (`POST /api/pipelines/import/v1`) is only for output
deliberately relying on its catalog adoption and compatibility prelude; Script
Node Environment reads lose their declarations there. Resolve that mismatch
before handing the file to the user.

## Requested external actions

If Project import was requested, confirm the intended importing account: the
new private Project belongs to the authenticated user, not the original YAML
writer. If deployment was requested, configure required Environment values,
resolve child targets and deploy callees before callers. A Deploy freezes
Project overrides and binding targets and reads Global values at launch
(ADR 0009); credentials are not supplied by callers. Report unset Variables as
blocking deployment and never print their values.

A node runs only where its imports resolve: the registry must serve the `core`
version it imports (a backend that ships it, ADR 0010) and the `artworks`
version it pins, and nodes using `sharp` need a piper-deno with Sharp in Worker
isolation (piper-deno ADR 0002).
