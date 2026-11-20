# Node package code is served to Deno from Piper's own Package Registry

A Node Package published as a Package Archive (zip) keeps its code in a private S3 bucket, one folder per package version. A separate `registry.ts` container serves those files read-only to Deno, behind a bearer token, on the internal network only. A node stores `script: registry:<package>@<version>/<node>/script.js`, and the backend turns that into the registry URL right before calling Deno. Deno `import()`s the URL, and the script's relative imports (`../utils.js`, `../node.js`) resolve against it, so packages keep their multi-file layout.

We considered two alternatives:

- **Bundling each node's script into one inline module on upload (esbuild).** This would leave Deno unchanged, but it adds a build step, the code that runs is no longer the code the author wrote (stack traces, debugging), and shared helpers are copied into every node.
- **Keeping code on GitHub behind jsDelivr URLs.** Every Launch then depends on a public CDN and on a git tag never moving, and a package can't be installed without publishing its code first.

The registry only stays correct if a published version never changes. Deno caches remote modules by URL, and Deploys and Launches keep their own copy of each node, including its registry reference. So every upload must bring a greater version, and versions are never deleted.

## Consequences

- `piper-deno` must allow imports from the registry host (`ALLOW_IMPORT_HOSTS`). `--allow-import=<hosts>` replaces Deno's default host list, so the service repeats that list itself and runs workers with explicit permissions (`--unstable-worker-options`).
- Each archive carries its own copy of the shared node helpers (`node.js`). Every import must stay inside the archive or point at a pinned remote module on a host Deno allows by default. The catalog needs a pack step that copies the helpers in and rewrites their import path.
- A node's `app` (HTML for the browser) is stored inline, because browsers can't reach the registry.
- Moving the registry, or running it locally, needs no data migration: stored scripts carry no host.
