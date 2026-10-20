# Backend HTTP contracts

These behaviors are exercised by `backend/tests/unit/http` using the production
Express middleware, selected route modules, JWT verification, bcrypt comparison,
model transformations, validators, launch logic, and billing checks. Storage,
queues, Deno, and reporting use explicit test doubles.

## Authentication

- `user-token` is verified as a JWT. Its user ID is used to load the current user,
  roles, and balance from MongoDB. Token-supplied roles do not grant access.
- `api-token` must pass JWT verification, have a stored Redis hash, match that
  hash through bcrypt, and resolve to an existing user. Deleting or replacing
  the hash revokes the API token. Expired or invalid tokens return 401.
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

Project read and launch handlers currently allow logged-in non-owners to access
private projects. Launch interruption checks live-launch existence without an
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
