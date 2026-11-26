# Taiga UI in Piper: gotchas

What the vendored `taiga-ui` skill and the Taiga docs don't say, learned while
moving screens off `src/ui-kit` (#92). Test-side gotchas live in
`frontend/tests/README.md` ("Taiga controls in specs").

- **Form controls for non-standalone components** come from
  `src/app/taiga-forms.module.ts`. Add a `Tui*` control there (spread the
  array exports, e.g. `...TuiInputChip`) before using it in a template;
  a bare `tui*` attribute without the import renders an inert native control.
- **A native `select[tuiSelect]` shows `null` as an empty field**: the label
  sits as a placeholder and the "none" option's label never appears. Give
  "none" a sentinel value of its own and map it to `null` on save (see
  `project-settings.component.ts`), and set `[tuiTextfieldCleaner]="false"`
  so the clear button can't bring the empty state back.
- **`tuiInputNumber` formats with a thousands separator** (1000 shows as
  "1 000"). Bind `[tuiNumberFormat]="{ thousandSeparator: '' }"` for ids and
  versions.
- **Tags are `input[tuiInputChip]` in `<tui-textfield multi>`** with
  `<tui-input-chip *tuiItem />`; its value is a `string[]`.
- **Field errors are `<tui-error formControlName="…" />`** under the
  `tui-textfield`. Its message comes from the app-wide set in
  `src/providers/validation-errors.ts` (`required`, `minlength`, `email`,
  `pattern`, `passwordMismatch`), keyed by the validator's error name, and
  shows once the control is touched (see change-password). Add a key there when a validator is
  shared; override a message for one form with `tuiValidationErrorsProvider`
  in that component's `providers`. A form-level error (e.g. the change-password
  mismatch) needs `<tui-error [error]="…">` bound to the group's error.
- **`tui-textfield` doesn't turn red on its own for a reactive control**:
  `input[tuiInput]` takes its invalid state only from the textfield's
  `[invalid]`, and Taiga draws it whether or not the control was touched.
  To mark a field only after the user leaves it or submits (what the old
  `invalidField` pipe did), bind
  `[invalid]="form.controls.x.touched && form.controls.x.invalid"`.
- **A filled `tui-textfield` shows a clear (×) button by default.** Set
  `[tuiTextfieldCleaner]="false"` where the old input had none (no redesign).
- **Show error text only where the screen showed it before** (#134): most
  forms only marked an invalid field with a red border, which `tui-textfield`
  draws from `[invalid]`. Adding `<tui-error>` to such a field is new text,
  i.e. a redesign.
- **`tuiPassword` is an attribute of `<tui-icon>`**:
  `<tui-icon tuiPassword />` inside the `tui-textfield` adds the show/hide
  toggle; it needs `TuiIcon` (both come with `TaigaFormsModule`).
- **`textarea[tuiTextarea]` ignores `rows`**: it grows between `[minRows]`
  and `[maxRows]` (default 1 to 3). Set both to the old `rows` to keep the
  height. It marks invalid through `[invalid]` like `tuiInput`.
- **A `tui-textfield` in a flex row shrinks to almost nothing**, where a
  native input kept its default width. Give it the old width (see the assets
  folder field).
- **A borderless inline editor (the project title) is `<tui-input-inline>`**
  around a plain `<input formControlName>`, styled by the component; a
  `tui-textfield` would add a box.
- **Suggestions for a free-text field (the old `<datalist>`)** are a
  `<tui-data-list *tuiDropdown>` inside the `tui-textfield`, with
  `button[tuiOption][value]` per option; picking one writes its value into
  the input. Don't set `[stringify]` on that textfield to show labels: the
  input then shows the label too. Render the label as the option's text and
  filter in the component (see `edit-input`). The input gets
  `role="combobox"`, so locate it by CSS or label rather than as a textbox.
- **`app-json-editor` keeps the `@json-editor/json-editor` DOM** and styles it
  through `::ng-deep` with Taiga variables (`--tui-background-base` for
  fields, `--tui-border-normal`, `--tui-background-neutral-1` for its buttons),
  so it follows the theme like a `tui-textfield` without wrapping each control.
- **`@keyframes` are global and can live in unrelated files**: the ui-kit
  `spinner` was defined only in `tables.scss` and `defs/buttons.scss`, while
  `menus.scss` and a mixin in `animations.scss` animated with it. Before
  deleting a stylesheet in `src/styles/`, grep `animation:` for its
  keyframes (#160).
- **Piper's icons are a Taiga registry, not `app-icon`** (#178). The SVGs in
  `frontend/src/icons/` load as text (the `.svg` loader in `angular.json`)
  and are registered with `tuiIconsProvider(PIPER_ICONS)` under their old bare
  names, which pipelines use in data. Draw one with `<tui-icon icon="name">`,
  or with `iconStart="name"` on a Taiga button.
  - Taiga paints the icon as a mask in `currentColor`. The SVG must be opaque
    (`stroke`/`fill="currentColor"`) and carries its own `stroke-width`: a
    stroke of 2 is a separate `-bold` entry. Multicolor logos are `@img.`
    entries, which Taiga draws as images.
  - `src/styles/icons.scss` gives every registry icon app-icon's 22px and
    `--icon-color`. Taiga marks the mode in `data-icon-start`: `tui`, `img`,
    `font`, or the icon's own name for a registry icon. Set
    `--app-icon-size`/`--app-icon-color` on the host for another size or
    color. The rule is `!important`, because Taiga sizes button icons per
    size with more specific selectors.
  - A masked icon differs from the old inline SVG only in edge antialiasing
    (at most 11/255 per channel in the screenshot diffs).
- **Tables are full width by default** (#184): `src/styles.scss` gives every
  `table` `inline-size: 100%` and a `.table-container` wrapper that scrolls
  sideways on narrow screens. Wrap each table in `.table-container`, leave one
  main column without a width to take the spare space and give the others
  fixed widths through component classes, not `width="…"` attributes. Taiga's
  `tuiTable` sets no width of its own.
- **Blocking messages are `tuiDialog` templates** (#199, formerly
  `app-informer`). An error is one line: `<app-error-dialog [error]="error"
  (closed)="error = null" />` (message, optional `details` list, OK). A
  dialog with other content is `<ng-template [tuiDialog]="open"
  (tuiDialogChange)="open = $event">` (see signup's confirm-email step).
  - **Bind `(tuiDialogChange)`, always.** The directive builds its open/close
    stream from that output, so a template that only binds `[tuiDialog]`
    never opens.
  - A dialog renders in `tui-root`'s portal, outside the component's
    element, so specs look for it in `document` (`tui-dialog`).
