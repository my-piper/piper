---
name: new-migration
description: Create a paired up/down MongoDB or ClickHouse migration in migrations/ and review it before it is applied.
argument-hint: mongo|clickhouse <snake_case_name> [what it changes]
disable-model-invocation: true
---

Create a migration from `$ARGUMENTS`. The first word is the store (`mongo` or
`clickhouse`), the second is the name in `snake_case`, and the rest describes
the change. Ask if the store or name is missing.

1. Create the files non-interactively (the `make *-migrate-add` targets
   prompt for input):

   ```sh
   npm run --prefix ./backend cli migrations <store> add <name>
   ```

   If the CLI fails (for example on Node ≠ 22), create the files by hand
   instead. Use the next free `NNNNNN` number in `migrations/<store>/` and
   the same extensions as the existing files (`.up.json`/`.down.json` for
   mongo, `.up.sql`/`.down.sql` for clickhouse).
2. Fill `up` with the change and `down` with its exact inverse. Read the two
   most recent migrations in that folder and match their format.
3. **ClickHouse:** columns of tables fed by Kafka must match the stream
   payload models declared in `backend/app/streams.ts`. Prefer
   `ADD COLUMN IF NOT EXISTS` and `DROP COLUMN IF EXISTS` so re-runs are safe.
   Review sort keys and types with the `clickhouse-dba` skill if it is available.
4. **Mongo:** index migrations name their indexes explicitly so `down` can
   drop them by name.
5. Show both files and ask before applying. Apply only on request, with
   `make mongo-migrate` or `make clickhouse-migrate` against local infra
   (`make up`).
