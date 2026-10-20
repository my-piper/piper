# Backend open decisions

Found while extending backend test coverage (2026-10-20). Each item needs a
product or compatibility decision before it is changed.

## Old API tokens stay valid after regeneration

`api/users/generate-api-token.ts` stores a bcrypt hash of the issued JWT.
bcrypt reads only the first 72 bytes, and for typical user IDs the part of the
token that differs (issue time, signature) comes after them. Any API token ever
issued to a user matches whichever hash is stored, so regenerating revokes
nothing.

- Fix: hash a digest of the token (for example SHA-256) or store a token ID.
- Cost: every existing API token stops working.
- Test: `backend/tests/unit/http/login.test.ts`, the `it.fails` case
  "revokes the previous API token when a new one is generated".

## Any logged-in user can read another user's profile

`GET /api/users/:id` (`api/users/get-user.ts`) returns another user's email and
roles to any logged-in user. Decide whether this should be admin-only, limited
to the current user, or reduced to public fields.

## Password change does not ask for the current password

`api/me/change-me-password.ts` updates the password with only a valid session.
A stolen session can take over the account permanently.

## Signup confirmation codes are never deleted

After a successful signup, the confirmation code stays in Redis until it
expires (`api/users/signup.ts`). Deleting it after use prevents reuse.

## Authentication and permission status codes

Missing login (`You aren't logged`) and missing role (`You aren't admin`) return
400 through `DataError` in `utils/http.ts`. 401/403 would be conventional, but
changes what the frontend receives; check its error handling first.

## Usage record times depend on the server time zone

core-kit's `dateTransformer` serializes job dates as `yyyy-MM-dd HH:mm:ss` in
the process's local time zone and drops milliseconds. `processedAt` in pipeline
usage records therefore depends on the worker's time zone. Either confirm that
every worker runs with the same `TZ`, or switch job dates to ISO 8601 UTC.

## ESLint cannot lint application code

`npx eslint api/...` crashes on `main` with "Error while loading rule
'@typescript-eslint/no-unused-expressions'" (ESLint 9.17 and the installed
typescript-eslint plugin disagree). CI lints only `tests`. Aligning the versions
would let CI lint the whole backend.
