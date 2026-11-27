# Design

Piper's interface is a working tool used for hours at a time: dense, calm, dark by default, with color reserved for meaning. The canvas works like a node editor (ComfyUI-style). Everything else frames the canvas.

The source of truth for the look is the **Piper design system** in Claude Design: https://claude.ai/artifact/4obAXWeTY4DyTpiUmjMbXg. It holds tokens for both themes, the type scale, sizes, data-type colors, and specs with previews for nodes, wires, node search, buttons, fields, tables, dialogs and the app shell. The mockups the redesign (#266) was built from are at https://claude.ai/artifact/KQQVSFg45Ck1fqHxhY6zv9.

## Where it lives in code

| What | File |
| --- | --- |
| Color, shadow, spacing, radius, canvas-geometry and font tokens, per theme | `frontend/src/styles/themes.scss` |
| Taiga's theme variables mapped onto the tokens | `frontend/src/styles/themes.scss` (`taiga-palette`) |
| Control heights and the text scale, read by Taiga | `frontend/src/styles/sizes.scss` |
| Default size `m` for buttons and textfields | `frontend/src/app/app.module.ts` (`tuiButtonOptionsProvider`, `tuiTextfieldOptionsProvider`) |
| Theme mode (dark, light, system) | `frontend/src/services/theme.service.ts`, and the inline script in `frontend/src/index.html` that sets `data-theme` before bootstrap |

Style new UI through the tokens (`var(--surface-1)`, `var(--text-muted)`, `var(--space-2)`) and Taiga components. The graphite scale (`--graphite-*`), `--page-background`, `--node-background` and the Sass color variables in `variables.scss` are legacy names that point at the tokens. Don't use them in new code.

## Rules

- **Color means something.** Surfaces are neutral graphite: `bg-app`, `surface-1` to `surface-3`, separated by a 1px `border`, not shadows.
  - Hue is only for a data type (sockets, wires), a run state, an execution type, or the one primary action per view.
  - `accent` (Piper yellow) marks the primary action, the focus ring, the selection and a running node.
  - Always pair a state color with a word or icon.
- **Both themes are first class.** Every token has a dark and a light value. Check a change in both. Never write a hex color in a component.
- **Dense, not cramped.**
  - Text: 13px body (`--tui-typography-body-m`), 12px small, 11px captions.
  - Spacing: steps of 4px.
  - Lists are tables (32px rows) rather than card grids. Details open in a drawer rather than a new page.
- **Type.** Inter for the interface, JetBrains Mono for IDs, versions, values, durations, logs and port types.

## Sizes

Taiga's size scale is remapped:

| Taiga size | Height | Use |
| --- | --- | --- |
| `xs` | 20px | icon buttons inside node title bars, inline chips |
| `s` | 24px | tables, toolbars, canvas nodes |
| `m` | 28px | everything else; it is the default, so templates leave `size` out |
| `l` | 32px | sign-in and sign-up forms, the top bar's primary action |

Don't set `size="m"`. Set `size="s"` only in tables, toolbars and on the canvas.

## Canvas

**Nodes**
- Geometry: 220px wide (`--node-width`), a 26px title bar (`--node-title`) and 22px port rows (`--port-row`). Inputs are on the left and outputs on the right, one per row.
- Title bar: `surface-2`, with a 3px left edge in the execution type's color (`exec-rapid`, `exec-regular`, `exec-deferred`, `exec-protracted`), the category icon, the title and up to two tools.

**Sockets and wires**
- Sockets are 10px (`--socket`), colored by the port's data type. Arrays (`string[]`, `image[]`, `video[]`) are hollow rings of the same hue. Unconnected optional sockets are dimmed.

| Type | Token |
| --- | --- |
| string, string[] | `--type-string` |
| integer | `--type-integer` |
| float | `--type-float` |
| boolean | `--type-boolean` |
| json | `--type-json` |
| image, image[] | `--type-image` |
| video, video[] | `--type-video` |
| audio | `--type-audio` |
| archive | `--type-archive` |
| unknown | `--type-any` |

- Wires are 2px beziers (`--wire`) in the source output's type color, 3px when hovered or selected. A wire into a running node animates a dash; with `prefers-reduced-motion` it stays solid.

**States**

| State | Look |
| --- | --- |
| Selected | 1.5px `--selection` outline |
| Running | `accent` border and a 2px progress bar under the title |
| Done | `success` border, briefly |
| Error | `danger` border, an error icon and an inline message that says what to do |

**Keyboard** (the `?` key shows the list)

| Keys | Action |
| --- | --- |
| Delete, Backspace | Remove the selection |
| Ctrl/⌘ + A | Select all |
| Ctrl/⌘ + Enter | Launch |
| Shift + drag | Marquee select |
| Space + drag | Pan |
| Ctrl/⌘ + wheel or plus/minus | Zoom |
| Shift + 1 | Fit to screen |

Keys typed into fields, editors, drawers and dialogs are left alone.

## Themes

- **Mode:** `ThemeManager` stores the mode under `theme` in `localStorage` and sets `data-theme` on `<html>`. The inline script in `index.html` does the same before bootstrap, so the first paint has the right palette. The backend's OAuth redirect page (`backend/packages/oauth/utils.ts`) reads the same stored mode.
- **Taiga:** Taiga's navigation header and aside force `tuiTheme="dark"`. `themes.scss` declares the tokens on `[tuiTheme]` descendants too, so they follow the app theme.
- **Monaco** follows the document theme (`applyMonacoTheme`).
- Not done yet: updating `<meta name="theme-color">` when the theme changes, and light variants of image assets.

## Copy

- Name things the way users see them: project, pipeline, node, input, output, launch, package, deploy.
- Use sentence case. Buttons are verbs ("Launch project", "Add node").
- Errors say what failed and what to do. No apologies, exclamation marks or emoji.
