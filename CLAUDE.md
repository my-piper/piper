# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The project instructions are maintained in `AGENTS.md` (shared with other agents) and imported here so there is a single source of truth:

@AGENTS.md

## Additions for Claude Code

- The Node major is pinned only in the root `.nvmrc`; to upgrade, change it and run `make check-node-version` to find the `engines` ranges and Dockerfile default that must follow.
- Run a single backend test: `cd backend && npx vitest run path/to/file.test.ts` (add `-t "<name>"` to filter by test name). Integration tests: `npm run test:integration` uses `vitest.integration.config.ts`.
- Run frontend tests with `cd frontend && npm run test:agent`: a passing run prints only the summary, a failing one only the failed tests. Focus with `-- --include=../tests/unit/models` (paths relative to `src/`) and `--filter "<name>"`; never commit `.only`. Playwright without rebuilding: `npm run test:browser:run -- -g "<name>"`.
- `ARCHITECTURE.md` has the full system diagram and deeper walkthroughs of the process model and launch flow — read it before larger backend changes.
- Before committing backend, schema or model changes, run the `piper-invariants-reviewer` subagent. After changing an HTTP route, response shape or model, run `contract-sync-checker`. Other subagents in `.claude/agents`: `backend-test-writer`, `node-package-author`.
