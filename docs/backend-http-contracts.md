# Backend HTTP contracts

These behaviors are exercised by `backend/tests/unit/http` using the production
Express middleware, selected route modules, JWT verification, bcrypt comparison,
model transformations, validators, and launch logic. Storage,
queues, Deno, and reporting use explicit test doubles.

## Authentication

- `user-token` is verified as a JWT. Its user ID is used to load the current user,
  and roles from MongoDB. Token-supplied roles do not grant access.
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

| Endpoint                                 | Current requirement                        | Successful status |
| ---------------------------------------- | ------------------------------------------ | ----------------- |
| `GET /api/projects/:_id`                 | Project owner or admin                     | 200               |
| `POST /api/projects`                     | Logged-in user                             | 200               |
| `DELETE /api/projects/:_id`              | Project owner or admin                     | 204               |
| `POST /api/projects/:_id/launch`         | Project owner or admin                     | 200               |
| `POST /api/launches/:id/interrupt`       | Logged-in user and an existing live launch | 204               |
| `GET /api/launches/:_id`                 | Launch visible to the user (see below)     | 200               |
| `GET /api/launches/:launch/logs`         | Launch visible to the user                 | 200               |
| `GET /api/launches/:launch/:node/status` | Launch visible to the user                 | 200               |

Project read and launch handlers, its stats, summary and comments (reading and
posting) return 404 unless the current user is the project's owner or an admin; there are no shared or public projects, and other
users reach a pipeline only through a Deploy. Project lists, folders, tags and
stats cover only the current user's own projects, for admins too. Launch interruption checks live-launch existence without an
owner lookup, then also interrupts every Child Launch (a launch whose `parent` is
this launch), recursively. Project delete and settings handlers reject other users, including
engineers without an admin role, with 400 and `You aren't admin`. Missing projects
and interruption of absent launches return 404. These tests record the existing
permission rules; permission/status changes need an explicit contract decision.

A launch is visible to the user who started it, the owner of the Project it
came from (`project.createdBy`, which Deploy and Child Launches copy from their
Project) and admins; to anyone else, and for a missing launch, these reads
return 404. `GET /api/launches/:launch/logs` returns
`{ available, logs, dropped }`: the Node Logs of every node (or only `?node=`),
oldest first by `ts`, each tagged with `node`, `level`, `message`, `attempt` and
`ts` (milliseconds; lines stored before `ts` was kept have none and come first,
in their node's order). Each node keeps its newest 1000 lines; `dropped` counts
the older lines removed per node. `available` is false, with no lines, once the
launch's live state has expired.

## Node and node package permissions

| Endpoint                                         | Current requirement                | Successful status |
| ------------------------------------------------ | ---------------------------------- | ----------------- |
| `GET /api/nodes`                                 | None                               | 200               |
| `GET /api/nodes/:_id`                            | None                               | 200               |
| `POST /api/nodes`                                | Admin/engineer                     | 204               |
| `POST /api/node-packages/actions/import-package` | Admin                              | 204               |
| `POST /api/node-packages/actions/upload-archive` | Admin                              | 200               |
| `DELETE /api/node-packages/:_id`                 | Admin                              | 204               |
| `GET /api/projects/:_id/check-node-updates`      | Logged-in user with project access | 200               |

`GET /api/nodes/:_id` strips `catalog` and returns 404 for a missing node.
`GET /api/nodes` lists each node with its `package` and, when that Node
Package is stored with a title, its `packageTitle`; the catalog sidebar groups
nodes by it.
Both node reads also serve the builtin Script Node (`_id: "script"`,
`source: "script"`) from code: `GET /api/nodes` lists it first whenever the
`search` matches its title, and `GET /api/nodes/script` returns it with no
inputs or outputs and an inline `run` script.
`POST /api/nodes` publishes a node to the catalog for engineers and admins;
anyone else gets 400 and `You aren't admin`. Project patches store every node's
script, environment and `isolated` mark as sent (ADR 0007); a `sign` an older
client sends is dropped. The id `script` is reserved: node publishing and
package import reject it with 400 and `Node id script is reserved`.
Package import and deletion reject non-admins with 400 and `You aren't admin`;
import stamps every node with the package `_id`. Node update checks return 404
for a private project unless the current user is its owner or an admin.

`POST /api/node-packages/actions/upload-archive` takes a Package Archive as the
multipart field `file` (zip, at most 20 MB packed and unpacked) and returns
`{ nodePackage, version, nodes, dropped }`: the package id and version, its node
ids, and the archive files left out of the registry. It answers 400 with a
`DataError` whose `details` list the offending files or nodes when the archive
has no `package.yaml` or nodes, a node folder has no `script.js`, an import
leaves the archive, misses a file or is an unpinned or unloadable remote
module, the version isn't a positive integer greater than the published one
or is already complete in the registry, the archive exceeds 20 MB, or a node id
belongs to another package. Nodes it publishes run `registry:<package>@<version>/<node>/script.js`.

## Validation and serialization

- Creating a project assigns server-generated IDs, ownership and creation
  time. The stored document contains pipeline/request data;
  the response contains summary fields.
- Project creation uses production AJV validation; invalid creation data
  reports `Project schema invalid`. Malformed JSON is rejected by Express's
  body parser with 400 before the route writes data.
- Two admin-only routes import a Pipeline as a new private Project owned by
  the caller, titled with the Pipeline's `name`. Both take `{ yaml }`: a
  Pipeline as YAML (or a URL to one), optionally followed by a line `------`
  and the Launch request as JSON. The separator line may carry trailing spaces
  and Windows line endings, and an empty Launch request after it imports as
  empty. Unparseable YAML ("Pipeline YAML is invalid"), Launch request JSON
  ("Launch request JSON is invalid"), a URL that can't be loaded ("Pipeline
  can't be loaded from the URL"; the reason is never told) and a document
  failing its schema ("Pipeline schema invalid", "Launch request schema
  invalid") are DataErrors. Text fetched from a URL is never quoted back. Every
  refusal answers 400 `{ message, details }`, `details` being a list of
  strings; a non-admin gets "You aren't admin".
- `POST /api/pipelines/import` takes a Pipeline in the current format and
  stores its Nodes as they are, dropping the `sign` an older export carried.
- `POST /api/pipelines/import/v1` takes a Pipeline copied from Piper v1 and
  brings each Node to what this Piper runs:

  - A Node from a Node Package (`package` set) is replaced by the installed
    Node Definition with the same `package` and `_id`, else its Node key, else
    the v1 id it was renamed from (`ask_llm_artworks` → `ask_llm_agent`). The
    Definition must have every input and output the Node's Flows use. When
    the Definition its name stands for lacks some, the one Definition of the
    same package that has them all is taken, with a warning naming both (a v1
    Node edited from a catalog Node, e.g. a QWEN Edit node kept under the key
    `generate_image`); none or several is a problem, and a name that stands
    for no Definition is never matched by ports. It takes the Definition's
    script, ports, Environment and `isolated` mark and keeps `arrange`.
  - A Node its user wrote (no `package`, no matching Definition) or one
    already marked `source: "script"` becomes a Script Node with no
    Environment (the v1 importer still drops it). A Piper v1 script keeps its code behind a prelude defining
    v1's `DEFINITIONS`, `httpClient`, `download`, `Buffer`, `nested`, `env`,
    `message` and `require`; `nested.run` asks for a Child Launch of the
    Deploy whose slug it names, and `nested.state` reads it from `children`
    once the child finished. `env` holds no Variables, `message()` writes to
    the Node's log, and `require()` fails the Node with a FATAL_ERROR naming
    the module; a script that requires one starts with a comment saying to
    rewrite it.
  - Every input a Flow reaches is marked `featured`, since the editor drops
    Flows into other inputs.

  Nothing is saved when any Node can't be brought over (no matching
  Definition, a Definition missing a used port, published code in a Script
  Node, or a v1 script without an exported `run`): the import answers a
  DataError "Pipeline can't be imported" whose `details` list every problem.
  Otherwise it answers the new Project with `warnings`: a Node brought onto
  another Definition by its ports, and each Script Node that needs work before
  it runs (a `require`; Environment reads, naming the Variables the script
  reads by name or its Node declared, which come back empty; `message()`
  calls); `[]` when there are none. Stand-ins for `env`, `message` and
  `require` are left out when the script declares that name itself.

- Reading projects serializes nested maps and dates and omits unexposed fields.
  Environment strings of Secret Variables are returned as `[encrypted]`; the
  Visible Variables named in `environment.visible` are returned in clear, and
  booleans and numbers retain their values. A missing `visible` means every
  string Variable is secret.
- On every Environment write (`PUT /api/environment` and the project `environment` PATCH delta), `[encrypted]` and Piper v1's
  `[hidden]` are placeholders, never values: they keep the stored value, and a
  name with no stored value is dropped. `[hidden]` arrives when an Environment
  copied from a v1 Project's YAML page is pasted. Variables v1 named
  differently take their current names on both the stored and the sent side
  (`OPEN_PAAS_USER` → `ARTWORKS_USER`, `OPEN_PAAS_PASSWORD` →
  `ARTWORKS_PASSWORD`, `PAAS_BASE_URL` → `ARTWORKS_URL`); a Variable already
  set under the current name wins, unless it holds only a placeholder and a
  new value was sent under the v1 name. A v1 name in `visible` carries over
  only with its value, so it never reveals a secret kept under the current
  name.
- Visibility is written with the values: `PUT /api/environment` (admin) and
  the project `environment` PATCH delta replace `visible` when they carry it
  (a `PUT` without `visible` keeps the stored list). A Secret Variable made
  visible without a new value is removed, so a stored secret is never
  revealed. Only names of string Variables stay in `visible`.
- The Global Environment (`/api/environment`) is read with `GET` by any
  logged-in user, masked as above. `PUT` (merge; `[encrypted]` keeps the
  stored value), `DELETE /api/environment/:key` (204, also when nothing is
  stored) and `POST /api/environment/:key/rename` with `{ name }` (moves the
  value and its visibility; 400 for a name that isn't
  `^[A-Za-z_][A-Za-z0-9_]*$` or that another variable already has, 404 when
  `:key` isn't stored) require an admin; anyone else gets 400. Removing a
  variable also removes it from `visible`.
- The project `environment` may carry `bindings`, a map from a Project Variable
  name to the Global Variable name it is read from when that differs (a Bound
  Variable); a name with neither an own value nor a binding reads the Global
  Variable of the same name. The project `environment` PATCH delta answers 400
  when either name isn't `^[A-Za-z_][A-Za-z0-9_]*$`, and drops the own value
  and the `visible` entry of every bound variable; empty `bindings` are
  omitted. Any project PATCH that carries `pipeline` or `environment` drops
  own values, bindings and `visible` entries of names no node of the
  resulting pipeline declares. At launch a bound variable is read only under
  the bound name and stays unset when the Global Environment lacks it; this
  holds for every launch (owner, admin, Deploy, Child Launch).
- Launching merges the saved launch request with the request body and runs model
  validation before initializing/scheduling the launch. Falsy inputs survive the
  HTTP-to-model-to-Redis path. Responses omit the pipeline and include the merged
  request and launching user's ID.
- Successful value responses receive the production no-cache headers. Objects
  become JSON; `null`, numeric zero, and empty-string handler results return 204.
  Handlers may send their own response and return `undefined`.

## Users and current user

| Endpoint                              | Requirement                          | Successful status  |
| ------------------------------------- | ------------------------------------ | ------------------ |
| `POST /api/login`                     | None; identity is login or email     | 200                |
| `POST /api/signup/confirm`            | `ALLOW_SIGNUP=yes`; captcha if set   | 204                |
| `POST /api/signup`                    | `ALLOW_SIGNUP=yes`; emailed code     | 200                |
| `POST /api/me/api-token/generate`     | Logged-in user                       | 200                |
| `GET /api/me`                         | Logged-in user                       | 200                |
| `POST /api/me/change-password`        | Logged-in user                       | 204                |
| `POST /api/me/identities/oidc/link`   | Logged-in user; `OIDC_AUTH=yes`      | 200                |
| `DELETE /api/me/identities/:provider` | Logged-in user; 404 if not connected | 204                |
| `GET /api/users/:_id`                 | Logged-in user                       | 200, 204 if absent |
| `GET /api/users`                      | Admin                                | 200                |
| `POST /api/users`                     | Admin                                | 200                |
| `PATCH /api/users/:_id`               | Admin                                | 200                |
| `DELETE /api/users/:_id`              | Admin; 404 if absent                 | 204                |

- Login returns `Email or password is incorrect` (400) for both unknown users
  and wrong passwords, and `You need to reset your password` for users without
  one. Passwords must be 6–20 characters before users are read.
- Signup requires the code stored by `/api/signup/confirm` (5-minute TTL),
  rejects `+` addresses and addresses the external verifier does not report as
  `VALID`, and stores a bcrypt hash.
- API token generation stores a bcrypt hash of the issued JWT in Redis.
- `/api/me` and the auth middleware load users without password hashes. Password
  changes require 6–32 characters, update only the current user's hash, and do
  not ask for the current password, so users created through single sign-on
  can set one.
- `/api/me` adds `identities` (connected single sign-on accounts) and
  `hasPassword`.
- `/api/me/identities/oidc/link` returns `{ ticket }`, stored in Redis for 5
  minutes; the browser opens `/oauth/oidc?link=<ticket>` to connect an account
  (see `docs/sso.md`); with `OIDC_AUTH` off it answers 400
  `Single sign-on is disabled`. Disconnecting is refused (400) when the user would be
  left without a password or another identity.
- Admin user creation and updates use the production user schema
  (`User schema invalid`, unknown fields rejected); duplicate users report
  `User exists`. Non-admins, including engineers, get 400.

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
