# Node Package scripts

Each node folder in a Package Archive contains `schema.yaml`. Script source
belongs in the adjacent `script.js`; a `script` field in `schema.yaml` is rejected.
Piper generates `registry:<package>@<version>/<node>/script.js` for the published
Node Definition.

A schema may instead supply `scriptUrl`:

```yaml
title: Echo
scriptUrl: https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@v2.0.4/nodes/echo/script.js
```

An explicit `scriptUrl` takes precedence over `script.js`, which may then be
omitted. Like remote imports in an archive, it must use HTTPS, a supported Deno
module host, and a pinned version or commit. Empty and null URLs are errors.
The published Node Definition stores the selected reference in its existing
`script` field. Stored Pipelines and the separate YAML package import format
keep their existing representation.

The pipeline node's script editor shows source, including for registry and URL
references. Only engineers and admins can load source through the authenticated
backend endpoint. Remote source requests are bounded and do not follow redirects.
Loading failures show an error and leave saving disabled.

Saving without changing the source keeps the original reference, including when
only the execution type changes. Saving edited source creates a Script Override
for that pipeline node and signs the resulting code. Relative imports,
re-exports, literal dynamic imports and `import.meta.url` are resolved against
the original module URL. Computed dynamic imports cannot be safely resolved and
produce a save error. Comments and ordinary string values are preserved.

Overrides contain absolute dependency URLs, including the current registry host
when the source came from the registry. Moving the registry therefore requires
updating those override URLs. Unedited registry references remain portable.
