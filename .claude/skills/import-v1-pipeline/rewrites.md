# v1 rewrite rules

Preserve flow endpoints and port contracts while applying every relevant code
rewrite. Editor metadata repairs are specified in the main skill. Record each
behavior change (not each edit) in the report.

## n8n

n8n is gone. Delete every call to an n8n host together with the code that
exists only to feed it: in Duo's `moderate_input_image` and
`moderate_output_image`, the whole `try { … httpClient(… n8n.artworks.ai/webhook/blocked-images …) } catch {}`
block and the `N8N_USER`/`N8N_PASSWORD` reads and declarations. The logic
around it (`blockedBy` → `FatalError`) stays as it is. Removing the
notification is not a behaviour change worth reporting beyond one line.

## sharp

Keep `sharp`. piper-deno grants `--allow-ffi` and loads its pinned
`npm:sharp` for the bare specifier, but only in Worker isolation (piper-deno
ADR 0002): never mark a Node that uses it `isolated: true`. Rewrite only the
v1 loading and the byte types:

```js
import sharp from "sharp";
const image = sharp(data); // Buffer from core's download()
```

`require('sharp')` becomes the import, and a `Buffer` result
(`.toBuffer()`) is used as it is or passed to `Buffer`-free code as a
`Uint8Array`. Sizing, `fit`, `withoutEnlargement`, `.rotate()`, `.blur()`,
`.composite()` and encoder options stay as v1 wrote them.

A Node that decodes large images is memory-bound: a Node that resizes several
images (Duo's `prepare_images`) should keep only one decoded image at a time.

## form-data, openai

- `require('form-data')` → the global `FormData` with
  `form.append('images', new Blob([bytes], { type: 'image/jpeg' }), 'image.jpg')`;
  drop its manual multipart headers and let `fetch` set the boundary.
- `require('openai')` → a direct `fetch` to the same endpoint the client
  called (`POST <baseURL>/chat/completions`, `Authorization: Bearer <key>`),
  keeping the request body the script built. This adds no dependency.

## artworks

v1's built-in `artworks` module (`ArtWorks`, `FatalError`) is the published
artworks package's client. Import it by quoted reference, pinned to the version
the registry serves, and catch its errors as that package's own `FatalError`
(the class the client throws, distinct from core's):

```js
import { ArtWorks } from "registry:artworks@<N>/utils.js";
import { FatalError as ArtWorksError } from "registry:artworks@<N>/node.js";
const artworks = new ArtWorks(env);
```

Use the client as it is, one copy for every Node. It answers both ways a Node
polls:

- v1's own state machine: `postTask(payload)` answers the task id, as v1's
  `createTask` did; `checkState(task)` answers `results.data`, or null while
  the task runs, and throws a `FatalError` for a failed, canceled or unknown
  task (a `TimeoutError` for a timed out one). The Node keeps its own
  attempts, delays, cancellation and fallbacks.
- the catalog's: `createTask` answers a repeat instruction and `checkTask` the
  data or `{ __repeat }`.

Keep v1's calls on `postTask`/`checkState` (rename v1's `createTask` call to
`postTask`), so task payloads, priorities, polling state, cancellation and
fallback paths stay as they were; the client adds `priority: 1` unless the
payload sets one. `ARTWORKS_URL` (v1's `PAAS_BASE_URL`) replaces the API base
when set; tests point it at a mock. Declare `ARTWORKS_USER`,
`ARTWORKS_PASSWORD` and, if used, `ARTWORKS_URL`.

## Dynamic require

`require(name)` with a computed name (Extend Video's `image_to_video`, WAN's
`image_to_video`) can't be read statically. Read the code that builds
`name`, list every module it can name, and rewrite each case by the rules
above. If a case can't be resolved, stop and ask.

## Environment

- Current Nodes read `env.variables` as a plain object: `env.variables.get('X')`
  becomes `env.variables.X`. Add `env` to the invocation payload destructuring
  and pass it to helpers explicitly; renaming a global read is insufficient.
  Declare every consumed name in the node's inline `environment`, with type
  and description. Retain those
  declarations for regular Import and remove obsolete declaration `scope`
  fields. Do not embed the v1 importer's empty Environment stand-in.
- `env.scope` is also a plain object. Rewrite `env.scope.get('X')` to
  `env.scope.X`. Where `=== 'user'` identifies personal credentials to skip
  billing, use `=== 'pipeline'` for a Project override. The current values
  are `global` and `pipeline`; inspect other scope-dependent branches for
  their intended behavior. Check installed catalog scripts too: adopting a
  Definition does not repair its script.
- v1 names map as `backend/packages/environment/v1-variables.ts` maps them:
  `OPEN_PAAS_USER` → `ARTWORKS_USER`, `OPEN_PAAS_PASSWORD` → `ARTWORKS_PASSWORD`,
  `PAAS_BASE_URL` → `ARTWORKS_URL`. List any other Variable the report must
  ask a person to set.
- Externalize embedded credentials into declared Variables, including HAL9
  Basic auth as `HAL9_USER` / `HAL9_PASSWORD`. Report values the user must set;
  keep source credentials out of generated code, logs and fixtures.
- Each declared name defaults to the Global Variable of the same name. A
  Project can bind it to another Global name or override it with its own
  value. Missing Global bindings stay unset; saving the Project removes
  Environment entries no Node declares. Put personal credentials on the
  Project that needs them; only admins edit the Global Environment.
- Configure required values before deploying. A Deploy freezes Project
  overrides and binding targets, then reads Global values when launched.
  Deploys and Child Launches use these values regardless of caller, so an
  override is used for every caller. User Environments no longer exist;
  never assume a caller supplies their own credentials.

## v1 globals

v1 ran scripts in a `node:vm` context whose globals current scripts import from
the built-in core package instead (ADR 0010). Keep v1's code and add the
imports at the top of the script, with one line that gives `DEFINITIONS` back
its shape:

```js
import {
  DataError,
  FatalError,
  TimeoutError,
  download,
  httpClient,
  next,
  repeat,
} from "registry:core@1/node.js";
const DEFINITIONS = {
  FatalError,
  TimeoutError,
  DataError,
  NextNode: { from: next },
  RepeatNode: { from: repeat },
};
```

Import only the names the script uses.

| v1 global                                      | in a current script                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFINITIONS.NextNode` / `RepeatNode` / errors | the `DEFINITIONS` line above                                                                                                                                  |
| `httpClient` (an axios instance)               | core's `httpClient`: same config, `.get`/`.post`/… shortcuts, `{ status, headers, data }`, axios-shaped errors, `validateStatus`                              |
| `download(url)`                                | core's `download`: `{ mimeType, data }` with a Buffer, v1's headers; an `application/octet-stream` answer keeps that type, where v1 relabelled it `video/mp4` |
| `nested.run` / `nested.state`                  | core's `createNested`, wrapped as below                                                                                                                       |
| `Buffer`                                       | `import { Buffer } from "node:buffer"`                                                                                                                        |
| `message(text)`                                | `console.log(text)`: Node logs replace pipeline messages; report the change                                                                                   |
| `env.variables` / `env.scope`                  | `env` from the invocation, see Environment                                                                                                                    |
| `useTempFolder`, `launch`, `NODE_ENV`          | no equivalent: stop and ask                                                                                                                                   |

`nested` becomes Child Launch instructions (ADR 0001). Wrap v1's `run` so each
invocation gets its own bookkeeping:

```js
import { createNested } from "registry:core@1/node.js";
async function v1Run({ nested, ...payload }) {
  /* v1's run, reading nested from here */
}
export async function run(payload) {
  const { nested, launches } = createNested(payload.children ?? {});
  const result = await v1Run({ ...payload, nested });
  return launches.length > 0
    ? { __type: "launch", launches, delay: result?.delay }
    : result;
}
```

A child's key is the order of its `nested.run` call, so the script must make
the same calls on every run until its children exist; v1's start-then-poll
pattern does.

core's `download` and `httpClient` answer bytes as a `Buffer`, as v1 did, so
`data.toString("utf8")` and `.toString("base64")` keep working. Bytes from
`fetch` itself are a `Uint8Array`: decode those with `TextDecoder` and
`Buffer.from(bytes)` before Buffer-style calls.
