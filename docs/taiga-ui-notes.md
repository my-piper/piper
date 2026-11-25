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
