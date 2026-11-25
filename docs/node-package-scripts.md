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
for that pipeline node. Relative imports,
re-exports, literal dynamic imports and `import.meta.url` are resolved against
the original module. For a registry module they become host-free references
into the same package version (`"registry:artworks@3/node.js"`), which the
backend points at `REGISTRY_URL` when it sends the script to Deno (any quoted
`registry:<package>@<version>/<path>` string in inline code is resolved this
way); an import that leaves the package version is a save error. For a remote module they
become absolute URLs. Computed dynamic imports cannot be safely resolved and
produce a save error. Comments and ordinary string values are preserved.

Overrides of registry modules therefore stay portable across environments, like
unedited references. Overrides saved before this carry the registry host of the
environment they were edited in: `npm run cli -- pipelines registry-imports`
reports them in projects and deploys, and `--apply` rewrites them (`--host`
adds other old registry hosts). Launch history in Mongo and launches running in
Redis keep their copies: nothing reruns the former, and the latter run while
the old host is reachable.
