# Backend HTTP contracts

These behaviors are exercised by `backend/tests/unit/http` using the production
Express middleware, selected route modules, JWT verification, bcrypt comparison,
model transformations, validators, launch logic, and billing checks. Storage,
queues, Deno, and reporting use explicit test doubles.

## Authentication

- `user-token` is verified as a JWT. Its user ID is used to load the current user,
  roles, and balance from MongoDB. Token-supplied roles do not grant access.
- `api-token` must pass JWT verification, have a stored Redis hash, match that
  hash through bcrypt, and resolve to an existing user. Deleting the hash
  revokes the API token (replacing it does not; see known defects). Expired or invalid tokens return 401.
- Removed users cannot authenticate even if their JWT or API hash remains valid.
- When both headers are present, the user token is validated first. An invalid
  user token rejects the request; two valid headers select the API token's user.
- A protected handler called without a user returns 400 with
  `{ "message": "You aren't logged", "details": {} }`. Invalid user/API tokens
  return 401 with `Wrong user token` / `Wrong API token` respectively.

## Project and launch permissions

| Endpoint                           | Current requirement                           | Successful status |
| ---------------------------------- | --------------------------------------------- | ----------------- |
| `GET /api/projects/:_id`           | Logged-in user; lookup accepts ID or slug     | 200               |
| `POST /api/projects`               | Logged-in user                                | 200               |
| `POST /api/projects/:_id`          | Project owner or admin                        | 200               |
| `DELETE /api/projects/:_id`        | Project owner or admin                        | 204               |
| `POST /api/projects/:_id/launch`   | Logged-in user plus applicable balance checks | 200               |
| `POST /api/launches/:id/interrupt` | Logged-in user and an existing live launch    | 204               |

Project read and launch handlers return 404 for a private project unless the
current user is its owner or an admin; public projects are readable and
launchable by any logged-in user. Launch interruption checks live-launch existence without an
owner lookup. Project update/delete handlers reject other users, including
engineers without an admin role, with 400 and `You aren't admin`. Missing projects
and interruption of absent launches return 404. These tests record the existing
permission rules; permission/status changes need an explicit contract decision.

## Validation and serialization

- Creating a project assigns server-generated IDs, ownership, creation time,
  and private visibility. The stored document contains pipeline/request data;
  the response contains summary fields.
- Project creation and settings updates use production AJV validation. Invalid
  creation data reports `Project schema invalid`; invalid settings currently
  report `Pipeline schema invalid`. Malformed JSON is rejected by Express's
  body parser with 400 before the route writes data.
- Settings updates persist visibility, slug, order, update time, and updater;
  client-supplied ownership/title fields do not replace the existing metadata.
- Reading projects serializes nested maps and dates and omits unexposed fields.
  Environment strings are returned as `[encrypted]`; booleans and numbers retain
  their values.
- Launching merges the saved launch request with the request body and runs model
  validation before initializing/scheduling the launch. Falsy inputs survive the
  HTTP-to-model-to-Redis path. Responses omit the pipeline and include the merged
  request and launching user's ID.
- Successful value responses receive the production no-cache headers. Objects
  become JSON; `null`, numeric zero, and empty-string handler results return 204.
  Handlers may send their own response and return `undefined`.

## Users, current user, and balance refills

| Endpoint                          | Requirement                        | Successful status  |
| --------------------------------- | ---------------------------------- | ------------------ |
| `POST /api/login`                 | None; identity is login or email   | 200                |
| `POST /api/signup/confirm`        | `ALLOW_SIGNUP=yes`; captcha if set | 204                |
| `POST /api/signup`                | `ALLOW_SIGNUP=yes`; emailed code   | 200                |
| `POST /api/me/api-token/generate` | Logged-in user                     | 200                |
| `GET /api/me`                     | Logged-in user                     | 200                |
| `POST /api/me/change-password`    | Logged-in user                     | 204                |
| `GET /api/balance-refills`        | Logged-in user; own refills only   | 200                |
| `GET /api/users/:_id`             | Logged-in user                     | 200, 204 if absent |
| `GET /api/users`                  | Admin                              | 200                |
| `POST /api/users`                 | Admin                              | 200                |
| `PATCH /api/users/:_id`           | Admin                              | 200                |
| `DELETE /api/users/:_id`          | Admin; 404 if absent               | 204                |

- Login returns `Email or password is incorrect` (400) for both unknown users
  and wrong passwords, and `You need to reset your password` for users without
  one. Passwords must be 6–20 characters before users are read.
- Signup requires the code stored by `/api/signup/confirm` (5-minute TTL),
  rejects `+` addresses and addresses the external verifier does not report as
  `VALID`, and stores a bcrypt hash. A configured `INITIAL_USER_BALANCE` is
  refilled once per client IP per day.
- API token generation stores a bcrypt hash of the issued JWT in Redis.
- `/api/me` and the auth middleware load users without password hashes. Password
  changes require 6–32 characters, update only the current user's hash, and do
  not ask for the current password.
- Admin user creation and updates use the production user schema
  (`User schema invalid`, unknown fields rejected); duplicate users report
  `User exists`. Non-admins, including engineers, get 400.
- Balance refills are read from ClickHouse 20 at a time by descending cursor;
  malformed cursors are rejected before querying.

Signup requires a pending confirmation code, and signup responses, signup
tokens, and admin user updates never include password hashes. Admin user search
matches the text literally.

Known defects are recorded as `it.fails` tests in `backend/tests/unit/http`:

- Regenerating an API token does not revoke the previous one: bcrypt reads
  only the first 72 bytes, which end before the JWT issue time and signature.

## Error mapping

| Error                  | HTTP behavior                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `DataError`            | 400; message and exposed details, or plain message when details are null            |
| `UnauthorizedError`    | 401 with message                                                                    |
| `NotFoundError`        | 404 with message                                                                    |
| `TooManyRequestsError` | 429 with message                                                                    |
| `PenTestingError`      | Existing 302 redirect                                                               |
| Unexpected error       | Reported to Sentry; 500 with `SERVICE_OFFLINE\|Our service temporarily unavailable` |

## Billing modes

`BILLING_ACTIVE=yes` blocks launch requests with non-positive or missing remaining
balance when `NODE_ENV=production`. This balance guard permits the same user in
test/development mode or when billing is disabled. Enabled billing also computes
and includes the launch cost estimate.

`TRACK_BALANCE=yes` independently enables accrued-balance checks for users at or
below `MIN_BALANCE_FOR_TRACK`. The Redis script receives the starting balance,
cost estimate, and a 300-second TTL. A resulting balance at or below zero rejects
the launch with 400 and `Please, top up your balance`, before launch persistence
or node scheduling. Users above the threshold bypass this check. Tracking can
reject a request even when `BILLING_ACTIVE=no`.
