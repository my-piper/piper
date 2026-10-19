# Preflight — piper

Run: 2026-10-20 · Workspace: `/Users/slapshin/Develop/projects/piper/piper`

**Where the code lives:** `legacy/` does **not exist**, and no `--source` was given, so nothing was linked. All checks
below were run against the repository root (`/Users/slapshin/Develop/projects/piper/piper`, with its three submodules).
Linking `legacy/` → this repo from *inside* this repo would make a recursive link, so the workspace should live
outside it (see "Most important fix").

## Answers

1. **Scope** — Is this code the complete system, or one slice of a larger codebase? If a slice: what outside it depends
   on code inside it, and is breaking those consumers acceptable?
   > Complete system

2. **Build & test locally** — Can this environment restore, build, and run the tests? Roughly how long does the full CI
   pipeline take?
   > Yes, builds here

   *Note from Check 3: as of this run the build does **not** pass here without `npm ci` first (stale `node_modules`),
   and there is no test suite. CI duration was not given — open item for the human.*

3. **Bespoke build infrastructure** — Is there organization-specific build or dependency machinery a newcomer would not
   guess? Where is it documented?
   > None beyond submodules

4. **Prior attempts** — Has anyone tried to modernize this before? What went wrong?
   > No prior attempts

5. **Off limits** — Is anything in this code not allowed to change in this pass?
   > Submodules + generated

   i.e. `backend/core-kit`, `frontend/src/ui-kit`, `translator`, and generated `schemas/compiled.json` (backend and
   frontend copies).

## Check 6 — Scope boundary

Standalone git repository (`github.com/my-piper/piper`), confirmed by the human as the complete system. But the
*runtime* system reaches outside the tree:

**Outbound (things this code depends on that are not in the tree):**

| Dependency | Where | Effect on map / delta catalog |
|---|---|---|
| `piper-deno` sandbox service (`ghcr.io/my-piper/piper-deno:sha-fcfb6e9`) | `tools/compose/compose.yaml`, `backend/packages/deno/execute.ts` | Node JS execution happens in a separate repo — its behaviour is invisible to the map |
| `my-piper/piper-nodes` utils loaded from jsDelivr (`@main`, unpinned) | `backend/api/projects/assistant/consts.ts:19,31,43` | Runtime-fetched code; unpinned `@main` |
| `../../piper-node/types/primitive.js` | `backend/tsconfig.json:28` | Path does not exist; stale |
| `piper-swarm` (production Swarm stacks) | per AGENTS.md | Production entry-point/replica config not in tree |
| Submodules `core-kit`, `ui-kit`, `translator` | `.gitmodules` | In tree but off limits; `core-kit` is also used by sibling `billing` |

**Inbound (blast radius):**

| Consumer | Uses | Decision needed |
|---|---|---|
| `../piper-locust` (load tests) | HTTP: `/api/launches/`, `/api/launches/{id}/state`, `/api/<deploy-slug>/launch` | Keep these API contracts stable or update locust |
| Deployed pipelines' API clients (external users) | Deploy launch API | Public contract — any change is a breaking change for customers |
| `../billing` | Shares the `core-kit` submodule, not piper code | None for piper code; `core-kit` is off limits anyway |

`brief` must record an explicit decision for the public HTTP API (deploy launch endpoints) before any in-place change.

## Readiness table

| # | Check | Status | Found | Fix |
|---|---|---|---|---|
| 0 | Human answers | ✅ | All 5 answered; CI duration not given | Add CI duration when known |
| — | `legacy/` location | ❌ | `legacy/` missing, no `--source` | Create an outside workspace and run with `--source` (see below) |
| 1 | Stack | ✅ | TypeScript/Node ESM backend (Express, BullMQ, tsx, no build step) + Angular 17 frontend; MongoDB, Redis, Kafka, ClickHouse, S3; Docker. Files: 635 `.ts`, 106 `.scss`, 88 `.html`, 44 `.json`, 12 `.sql`. LOC ≈ backend 16k, frontend 33k (incl. ui-kit 8k), core-kit 1.8k | — |
| 2 | Analysis tooling | ⚠️ | `python3` 3.12.9 ✅; `scc`, `cloc`, `lizard` missing | `brew install scc && pipx install lizard` |
| 3a | Build definition | ⚠️ | CI: `.github/workflows/build.yml` → Docker build `devops/docker/Dockerfile` on **`node:22`**, `npm ci` (public npm, no `.npmrc`), `ng build --localize`. No lint/test step in CI. Local node is **v26.12.0** (no `.nvmrc`/`engines` pin) | Pin Node 22 locally (`.nvmrc`), or run builds in `node:22` |
| 3b-1 | Backend `tsc --noEmit` | ❌ | 7 errors (~5 s): `openai` not installed (declared, stale `node_modules`); `packages/vm/utils` imported in `jobs/process-node/context.ts:20` but the module was removed in "feat: move script execution to deno"; `core-kit/packages/{mysql,telegram}` need `knex`/`telegraf`/`typegram` not in backend deps | `npm --prefix backend ci`; the dangling `vm/utils` import is a real latent bug; core-kit errors are off-limits noise |
| 3b-2 | Frontend `ng build --localize` | ❌ | Fails in ~27 s with 256 errors, all cascading from `TS2307: Cannot find module 'ng-hcaptcha'` (`app.module.ts:7`) → AppModule not an NgModule → NG8001/8002/8004 everywhere. `ng-hcaptcha` is in `package.json` but not in `node_modules` | `npm --prefix frontend ci`, then re-run the build |
| 3c | Tests | ❌ | No test suite (`npm test` exits 1) | Characterization tests before transform (test-engineer) |
| 4 | Source completeness | ⚠️ | Missing: `packages/vm/utils`, `../../piper-node`, Deno sandbox source, Swarm config. Present: JSON Schemas (`backend/schemas`), Mongo/ClickHouse migrations, compose, Dockerfile, worker Makefile. No binary-only artifacts | Optionally add `piper-deno` and `piper-swarm` as read-only context |
| 5 | Optional context | ✅ | Git: 321 commits, 2025-03-05 → 2026-10-20. Grafana MCP connected (Prometheus/Loki/Tempo) — piper coverage unverified | — |
| 6 | Scope boundary | ⚠️ | Standalone repo; outbound runtime deps + inbound public API (above) | Decide in `brief` |
| 7 | Source edit protection | ⚠️ | No `Edit` deny rule in project or user settings (`legacy/` doesn't exist yet either) | See snippet below |

**Check 7 snippet** for the modernization workspace's `.claude/settings.json` (add the target path because `legacy/`
will be a symlink):

```json
{ "permissions": { "deny": ["Edit(/legacy/**)", "Edit(//Users/slapshin/Develop/projects/piper/piper/**)"] } }
```

A permission rule covers Claude's file tools and the shell commands it recognizes (`sed`, `tee`, `> file`), not a
script that opens files itself. The hard guarantee is the OS: a read-only mount or a sandbox that blocks shell writes.

## Verdict per command

| Command | Verdict | Why |
|---|---|---|
| `assess` | Ready-with-gaps | Needs `legacy/`; without `scc`/`lizard`, LOC/complexity fall back to `wc` + keyword counts |
| `map` | Ready-with-gaps | Needs `legacy/`; Deno sandbox and Swarm config are out of tree |
| `extract-rules` | Ready-with-gaps | Needs `legacy/`; node execution semantics live in `piper-deno` |
| `brief` | Ready (after discovery) | Must decide the public deploy-API contract and the `piper-locust` consumer |
| `transform` / `reimagine` | Ready-with-gaps | Target toolchain not given; legacy build red until `npm ci`; no tests, so equivalence relies on recorded traces until characterization tests exist |
| `harden` | Ready-with-gaps | `python3` ok; no SAST tool (semgrep/`npm audit` once deps install) |
| `uplift` | Ready-with-gaps | Node 26 here vs 22 in CI (both runtimes would allow a dual run only if Node 22 is installed); `ng` CLI present in `frontend/node_modules` for `ng update` (Angular 17); fix `npm ci` first |

## Most important fix

Create the `legacy/` link in a workspace **outside** this repo, e.g.
`mkdir ../piper-modernize && cd ../piper-modernize` then `/code-modernization:modernize-preflight --source ../piper`,
and run `npm ci` in `backend/` and `frontend/` so both builds can be proven green.

Next step: `/code-modernization:modernize-assess`
