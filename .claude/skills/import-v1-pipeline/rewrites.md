# v1 rewrite rules

Every rule changes code, never Flows or ports. Record each behaviour change
(not each edit) for the final report.

## n8n

n8n is gone. Delete every call to an n8n host together with the code that
exists only to feed it: in Duo's `moderate_input_image` and
`moderate_output_image`, the whole `try { … httpClient(… n8n.artworks.ai/webhook/blocked-images …) } catch {}`
block and the `N8N_USER`/`N8N_PASSWORD` reads and declarations. The logic
around it (`blockedBy` → `FatalError`) stays as it is. Removing the
notification is not a behaviour change worth reporting beyond one line.

## sharp

`sharp` is a native addon: Deno runs it only with `--allow-ffi`, which neither
isolation mode grants. Use imagescript, pinned as piper-nodes pins it:

```js
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
const image = await Image.decode(data); // Uint8Array from download()
```

| sharp                                                                 | imagescript                                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.resize({ width: W })`                                               | `image.resize(W, Image.RESIZE_AUTO)`                                                     |
| `.resize({ height: H })`                                              | `image.resize(Image.RESIZE_AUTO, H)`                                                     |
| `.resize({ width: M, height: M, fit: 'inside', withoutEnlargement })` | scale by `Math.min(1, M / image.width, M / image.height)`, resize only when below 1      |
| `.jpeg({ quality: Q }).toBuffer()`                                    | `await image.encodeJPEG(Q)`                                                              |
| `(await sharp(b).metadata()).width/.height`                           | `(await Image.decode(b)).width/.height`                                                  |
| `sharp({ create: { width, height, background: black } })`             | `new Image(width, height).fill(0x000000ff)`                                              |
| `.composite([{ input, left, top }])`                                  | `canvas.composite(decoded, left, top)` per input                                         |
| `.blur(15)`                                                           | no blur: downscale to 1/16 and resize back up (pixelated, which is enough for a preview) |
| `.rotate()` (EXIF orientation)                                        | none: drop it and record the change (a rotated phone photo may come out sideways)        |

`metadata()` alone (Extend Video's `merge_videos`, `extract_last_frame`) only
needs the decode. A Node that decodes large images is memory-bound: a Script
Node runs in a child process with 128 MB, so a Node that resizes several
images (Duo's `prepare_images`) should stay at one decoded image at a time or
become a Package Node.

## form-data, openai

- `require('form-data')` → the global `FormData` with
  `form.append('images', new Blob([bytes], { type: 'image/jpeg' }), 'image.jpg')`;
  drop its manual multipart headers and let `fetch` set the boundary.
- `require('openai')` → a direct `fetch` to the same endpoint the client
  called (`POST <baseURL>/chat/completions`, `Authorization: Bearer <key>`),
  keeping the request body the script built. This adds no dependency.

## artworks

v1's built-in `artworks` module (`ArtWorks`, `FatalError`) is the piper-nodes
`ArtWorks` client in `nodes/artworks/utils.js` (`createTask`, `checkTask`,
`cancelTask` against `/api/v3/tasks`). It needs the Environment, so a Node
that uses it is a Package Node: copy the client into the package's `_lib/`,
match the v1 calls to its methods, and return `next`/`repeat` from
`utils/node.js` instead of v1's `NextNode`/`RepeatNode`.

## Dynamic require

`require(name)` with a computed name (Extend Video's `image_to_video`, WAN's
`image_to_video`) can't be read statically. Read the code that builds
`name`, list every module it can name, and rewrite each case by the rules
above. If a case can't be resolved, stop and ask.

## Environment

- Current Nodes read `env.variables` as a plain object: `env.variables.get('X')`
  becomes `env.variables.X`, and the Node's `schema.yaml` declares `X`.
- v1 names map as `backend/packages/environment/v1-variables.ts` maps them:
  `OPEN_PAAS_USER` → `ARTWORKS_USER`, `OPEN_PAAS_PASSWORD` → `ARTWORKS_PASSWORD`,
  `PAAS_BASE_URL` → `ARTWORKS_URL`. List any other Variable the report must
  ask a person to set.

## v1 globals in Package Nodes

A Package Node has no prelude: rewrite `DEFINITIONS.NextNode.from({ outputs })`
→ `next({ outputs })`, `RepeatNode.from({ state, delay, progress })` →
`repeat({ … })`, `FatalError`/`DataError`/`TimeoutError` → `throwError.*` or the
classes from `utils/node.js`, `httpClient` → `fetch` with a timeout and a
status check, `download(url)` → `fetch` + `new Uint8Array(await r.arrayBuffer())`.
`nested.*` stays in Script Nodes, where the prelude maps it to Child Launches.
