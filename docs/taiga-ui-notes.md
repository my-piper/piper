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
  shows once the control is touched. Add a key there when a validator is
  shared; override a message for one form with `tuiValidationErrorsProvider`
  in that component's `providers`. A form-level error (e.g. the change-password
  mismatch) needs `<tui-error [error]="…">` bound to the group's error.
- **Show error text only where the screen showed it before** (#134): most
  forms only marked an invalid field with a red border, which `tui-textfield`
  already does on its own. Adding `<tui-error>` to such a field is new text,
  i.e. a redesign.
- **`tuiPassword` is an attribute of `<tui-icon>`**:
  `<tui-icon tuiPassword />` inside the `tui-textfield` adds the show/hide
  toggle; it needs `TuiIcon` (both come with `TaigaFormsModule`).
