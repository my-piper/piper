# Shared node helpers ship with Piper as the built-in core package

Piper v1 ran node scripts in the backend's own `node:vm` context, which put helpers in every script's scope: `DEFINITIONS`, `download`, `httpClient`, `nested`. Scripts now run as plain modules in Deno (ADR 0006), so a script has to import them, and only a package's own archive carried a copy (`node.js`, ADR 0003). An inline Script Node had nowhere to import them from. The `core` package is that place: its versions live in the backend image under `backend/builtin-packages/core/<version>/`, and the Package Registry serves them before it looks in the bucket. Every installation has every released version without an upload, and a script imports `"registry:core@<version>/node.js"`.

`core@1` holds what v1 scripts relied on: `next`, `repeat`, the error classes and `throwError`, `createNested` for Child Launches, and `httpClient` and `download` over `fetch`, with v1's axios-shaped answers and Buffer bytes. Service clients (ArtWorks) stay in their own packages.

## Considered Options

- **Helpers injected as globals in Deno**, like v1's context. Rejected: unversioned, so a runtime upgrade changes every Node at once, and a script can't show where a name comes from.
- **A module built into piper-deno** (`@piper/node` in its import map). Same versioning problem, and it ties node code to the sandbox's release.
- **An ordinary package uploaded per installation.** It works, but every installation must remember to upload it, and it can drift or be missing.

## Consequences

- A released version never changes: `tests/unit/registry/builtin-releases.test.ts` pins each file's SHA-256 and lists every shipped file. A change goes into a new version folder.
- A Package Archive can't use the `core` id. Catalog packages still pack their own `node.js`; moving them to `core` would make each depend on a Piper that ships the version it imports.
- The server resolves quoted `registry:` references only in inline code, so a registry-loaded script can't import `core` by reference.
