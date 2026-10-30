# Frontend light theme plan

**Status (2026-10-30): implemented.** Tokens live in
`frontend/src/ui-kit/styles/themes.scss`; `with-alpha()` in
`ui-kit/styles/variables.scss` replaces `rgba()` on runtime colors. Mode is
handled by `ThemeManager` (`frontend/src/services/theme.service.ts`) and picked
in the header and on the login/signup frame (`app-select-theme`); the backend
OAuth redirect page (`backend/packages/oauth/utils.ts`) reads the same stored
mode. Not done: `<meta name="theme-color">` and
light variants of image assets.

The app is dark-only. All colours are compile-time SCSS variables in
`frontend/src/ui-kit/styles/variables.scss`, and 81 component stylesheets import
them. SCSS can't switch colours at runtime, so the main job is moving colours to
CSS custom properties.

## Current state

- **Tokens:** `ui-kit/styles/variables.scss` holds the graphite scale, the text,
  control, button and overlay colours, and `$page-background: #0e0e13`. Two
  canvas variables live in `src/variables.scss`: `$flow-color` and
  `$node-background-color: #111`.
- **Blockers:**
  - 27 uses of `rgba($var, α)` (for example in `node.component.scss` and
    `layout.template.scss`). These won't work once the variable is a CSS custom
    property.
  - 46 hex or rgb literals across about 20 files, mostly in `node`,
    `layout.template`, `launch-outputs`, `edit-pipeline-visual`,
    `edit-flow-transformer` and `select-playground`.
- **Monaco:** `theme: 'vs-dark'` is hardcoded in 11 templates (`edit-*`,
  `inspect`, `io-value`, the two import screens, `update-pipeline-nodes`).
- **Icons:** in `ui-kit/icon/icon.component.html`, no icon uses `currentColor`,
  and some have a hardcoded `stroke="#323232"`.
- **Unused:** the `UI.color` object in `ui-kit/consts.ts` is never referenced,
  so it can be deleted.
- **Backend:** nothing needs to change.

## Steps

### 1. Token layer (in the `ui-kit` submodule)

- Add `ui-kit/styles/themes.scss` with semantic CSS variables under
  `:root, [data-theme="dark"]` and `[data-theme="light"]`:
  - `--page-bg`, `--surface`, `--overlay-bg`, `--border`
  - `--text-primary`, `--text-secondary`, `--text-active`
  - `--control-bg`, `--control-focus-bg`, `--control-border`
  - `--button-bg`, `--button-hover-bg`, `--button-text`
  - `--node-bg`, `--flow`, `--shadow`
- Keep brand colours (primary, green, red, yellow, accent) the same in both
  themes. Darken them only where contrast on white falls below 4.5:1.
- Store alpha variants as separate tokens (for example `--border-subtle`) or as
  RGB triplets (`--graphite-60-rgb: 213 212 212`, used as
  `rgb(var(--graphite-60-rgb) / 0.1)`).
- Point the existing SCSS names at the new tokens
  (`$page-background: var(--page-bg);`). That keeps the 81 importing files
  compiling unchanged.
- Add `color-scheme: dark` and `color-scheme: light` per theme so scrollbars and
  native inputs follow.

### 2. Fix the blockers

- Rewrite the 27 `rgba($var, α)` calls to use alpha tokens or
  `color-mix(in srgb, var(--x) 75%, transparent)`.
- Replace the 46 literals with tokens. Pure black or white scrims for modals and
  overlays can stay.
- Move `$flow-color` and `$node-background-color` into the token set; the
  pipeline canvas needs its own light tuning.
- After this step the dark theme should look identical. Check that with
  before/after screenshots.

### 3. Theme service

- Add `services/theme.service.ts` with a signal of type
  `'dark' | 'light' | 'system'`:
  - Save the choice in `localStorage` (default `system`).
  - Resolve `system` through `matchMedia('(prefers-color-scheme: light)')` and
    listen for OS changes.
  - Set `document.documentElement.dataset.theme`.
- Add a small inline script in `index.html` that applies the saved theme before
  Angular starts, to avoid a flash of the wrong theme.
- Update `<meta name="theme-color">` when the theme changes.

### 4. Toggle

- Put a Light / Dark / System switch in the header user menu
  (`app/layout/layout.template.html`) and on the profile page (`app/me-user`).
- Wrap labels in `i18n` and run `npm run i18n` to update `locale/en.json`, then
  add the `ru` (and `de`) translations.

### 5. Third-party editors

- Monaco: replace the 11 hardcoded `vs-dark` values with the service's
  `monacoTheme()` (`vs` or `vs-dark`). Monaco themes are global, so also call
  `monaco.editor.setTheme()` on change; open editors then switch without
  remounting.
- JSON editor: give `json-editor.component.scss` token-based overrides.
- Rendered markdown and README (`pipeline-readme.component.scss`): check
  code-block styles.

### 6. Icons and assets

- Change single-colour icons to `currentColor`, including the `#323232` stroke.
  Leave brand logos (Google and the flags) alone.
- Check images and logos in `assets` for dark-only variants and add light
  versions where needed.

### 7. Tests

- Unit tests (Karma) for `ThemeService`: persistence, `system` resolution,
  applying `data-theme`.
- Component test for the toggle.
- Playwright browser workflow that switches theme, reloads, checks that
  `data-theme` and the computed `body` background persist, and covers
  `emulateMedia({ colorScheme: 'light' })` for `system`.
- Run `make lint` and `make test-frontend`.

## Order and size

1. Steps 1–2 together form one PR with no visible change, about 30 SCSS files.
   Most of the risk is here.
2. Steps 3–5 form a second PR that turns the feature on.
3. Steps 6–7, then a visual pass on the canvas, playground, modals, tables and
   forms.

## Default decisions

- **Where the choice is stored:** per device in `localStorage`, not on the
  `User` model. This needs no backend, schema or migration changes. Moving it
  to the account later is a small add.
- **Default:** `system`. If existing users should stay on dark until they opt
  in, default to `dark` instead.
- **Submodule:** steps 1–2 change `frontend/src/ui-kit`, so they need a commit
  in that repo before the parent repo's pointer is bumped.
