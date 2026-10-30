# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The project instructions are maintained in `AGENTS.md` (shared with other agents) and imported here so there is a single source of truth:

@AGENTS.md

## Additions for Claude Code

- Node version is pinned in `.nvmrc` (22); backend requires Node `>=22.12 <25`.
- Run a single backend test: `cd backend && npx vitest run path/to/file.test.ts` (add `-t "<name>"` to filter by test name). Integration tests: `npm run test:integration` uses `vitest.integration.config.ts`.
- Run focused frontend tests: Karma runs the whole suite, so temporarily use `fdescribe`/`fit` and `npm test`; remove them before committing. Playwright without rebuilding: `npm run test:browser:run -- -g "<name>"`.
- `ARCHITECTURE.md` has the full system diagram and deeper walkthroughs of the process model and launch flow — read it before larger backend changes.
- Project subagents in `.claude/agents` cover recurring tasks: `piper-invariants-reviewer` (check changes against cross-file invariants before committing), `contract-sync-checker` (backend/frontend/schema drift), `backend-test-writer`, `node-package-author`.
