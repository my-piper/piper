<!-- The live MCP / llms-full.txt is authoritative. If anything here disagrees with the live source, trust the live source. -->

# Concrete facts (offline safety net)

Load-bearing specifics for the Taiga UI major this skill tracks. Use them only when no live source is
reachable; otherwise confirm against the MCP / `llms-full.txt`.

> **Installing / wiring Taiga is not this skill's job** — it belongs to the [`taiga-ui-setup`](../../taiga-ui-setup/SKILL.md)
> skill (`ng add taiga-ui`, `provideTaiga()`, styles, `<tui-root>`, icons). The symbols below are listed
> so you can *recognise* correct wiring while building, not so you add it by hand.

### The mistakes this file exists to stop

- Importing a symbol from the wrong package (see boundaries below) — the #1 build error, and a wrong guess looks plausible.
- `TuiAlertService` for notifications — it *compiles*, then throws `NullInjectorError` (blank page). Use `TuiNotificationService`.
- `<input tuiTextfield>` as the text control, a `tuiFieldError` pipe, or a `*_DATA` dialog token — removed / never existed.
- `TuiSlider` from `@taiga-ui/kit` — it lives in **core** (kit only has the composite `TuiInputSlider`); wrong-package build error.
- Native `[checked]` / `[value]` on a CVA control — value never binds to the form; renders display-only, not interactive.
- `appearance="destructive"` (or `danger` / `error`) — no such value; `appearance` accepts any `string`, so it *compiles* and renders **unstyled** (silent, no build error). Use a compound `*-destructive` or status `negative`.
- Legacy setup (`NG_EVENT_PLUGINS` / `provideAnimations()`) instead of `provideTaiga()`.

## Stale recall — what training data still believes

Every row was checked against `llms-full.txt` and the published typings. The left column is wrong today;
writing it costs a build error, a runtime throw, or silently unstyled markup.

| If you remember… | Current reality |
|---|---|
| `TuiAlertService`, `[tuiAlert]` | `TuiNotificationService` (kit also ships a compact `TuiToastService`) |
| `tuiFieldError` pipe, `[error]="[] \| tuiFieldError \| async"` | gone — bare `<tui-error formControlName="x" />` + `tuiValidationErrorsProvider`; the pipe that does exist is `TuiErrorPipe` (`\| tuiError`) |
| `<tui-input>`, `<tui-input-password>` wrappers | `<tui-textfield>` + `<input tuiInput>`. **But** composite elements are real: `tui-input-chip`, `tui-input-inline`, `tui-input-range`, `tui-input-card-group` |
| inner directive `tuiTextfield` on the input | renamed `tuiInput`; `tuiTextfield*` now names the wrapper's options |
| `<tui-tag>` | `tuiChip` |
| badge as an element | `<span tuiBadge>` — the elements `tui-badge-notification` and `tui-badged-content` are different components |
| avatar as an element | the `[tuiAvatar]` attribute; `tui-avatar-stack` / `tui-avatar-labeled` are the composites |
| `[showLoader]` on a button | `[loading]`, which needs `TuiButtonLoading` (kit) imported next to `TuiButton` |
| `TUI_IS_MOBILE` | `WA_IS_MOBILE` (`@ng-web-apis/platform`) |
| `tuiPure`, `TuiLet` | gone — `computed()` / a pipe, and `@let` in the template |
| `TuiCell` from layout; Checkbox / Radio / Slider from kit | all in **core** |
| `provideAnimations()` + a manual event-plugin provider | one `provideTaiga()` |

## Setup symbols (wired by `taiga-ui-setup` — for recognition)

- Root provider: `provideTaiga()` (`@taiga-ui/core`) — wires event plugins + dark-mode sync. Do **not**
  add `NG_EVENT_PLUGINS` / `provideEventPlugins()` or `provideAnimations()` yourself (that is the legacy wiring).
- Root wrapper: `<tui-root>` (`TuiRoot`, core).
- Styles: `@taiga-ui/styles/taiga-ui-theme.less` + `@taiga-ui/styles/taiga-ui-fonts.less` — the separate
  **`@taiga-ui/styles`** package, **not** `@taiga-ui/core/styles/*` (that path does not exist → the
  `ng build` fails resolving the stylesheet before any component compiles).
- Icons: assets glob from `@taiga-ui/icons/src`, referenced by name as `@tui.<name>` (e.g. `@tui.search`).

If any of these is missing and portalled UI won't render, run the `taiga-ui-setup` skill — don't patch it here.

## Package boundaries (easy to get backwards)

> These package assignments are current — **trust them over your own recollection.** Importing a
> symbol from the wrong package is the #1 build error, and a wrong guess will still *look* plausible.

- **core:** `TuiButton`, `TuiIcon`, `TuiLink`, `TuiError`, `TuiTextfield` (the `<tui-textfield>` wrapper),
  `TuiInput`, `TuiLabel`, `TuiCheckbox`, `TuiRadio`, `TuiDataList`, `TuiDialogService`, `TuiNotificationService`,
  `provideTaiga`, `TuiRoot`, `tuiValidationErrorsProvider`, `TUI_DARK_MODE`, `TuiButtonX` (close "X"),
  `TuiSlider` (the range `<input type="range" tuiSlider>` — **not** kit).
- **kit:** the `tuiInput*` family, `TuiSelect`, `TuiComboBox`, `TuiTextarea`, `TuiInputDate`, `TuiChevron`,
  `TuiDataListWrapper`, `TuiButtonLoading`, `TuiSwitch`, `TuiSegmented`, `TuiTabs`, `TuiProgressBar`,
  `TUI_CONFIRM`, `TuiConfirmData`, `TuiNotificationMiddleService` (blocking / loading notification).
- **cdk:** `TuiControl` (abstract CVA base) + `tuiAsControl`, `TuiValueTransformer`, `TuiDay`, `TuiTime`,
  `tuiMarkControlAsTouchedAndValidate`, `tuiProvide`, `tuiCreateOptions`, `TuiActiveZone` / `TuiObscured`.
- **polymorpheus (`@taiga-ui/polymorpheus`):** `PolymorpheusComponent`, `injectContext`, `PolymorpheusContent`.

## Forms

- The base text input is **`<input tuiInput>`** (barrel `TuiInput`, core) — **not** `<input tuiTextfield>`. It
  **must be wrapped in `<tui-textfield>`** (`TuiTextfield`, core): `tuiInput` injects the textfield component and
  throws `NullInjectorError` at runtime without it. **Import both `TuiTextfield` and `TuiInput`.** `tuiTextfield`
  is not an input directive — it names the wrapper's size / cleaner / appearance options.
- `<tui-error formControlName="x" />` renders messages on its own via `tuiValidationErrorsProvider` (**core**).
  There is **no `TuiFieldErrorPipe` / `tuiFieldError` pipe** and no `[error]="[] | tuiFieldError | async"` — those
  were removed.
- Button `[loading]` needs `TuiButtonLoading` (**kit**) in addition to `TuiButton`.
- `tuiCheckbox` / `tuiSwitch` / `tuiSelect` etc. are CVA directives — bind `[(ngModel)]` / `formControl`, never
  `[checked]` / `[value]` (native attribute → value never binds; display-only, not interactive).
- **Select** is `<input tuiSelect>` inside `<tui-textfield tuiChevron>`, with options projected by
  **`*tuiDropdown` (`TuiDropdown`, core)** onto `<tui-data-list-wrapper [items]="…">`:
  `<tui-textfield tuiChevron><input tuiSelect [formControl]="ctrl" /><tui-data-list-wrapper *tuiDropdown [items]="items" /></tui-textfield>`.
  There is **no `*tuiTextfieldDropdown`** — inventing it is an `NG8116` and the dropdown never opens. Import
  `TuiSelect` + `TuiDataListWrapper` + `TuiChevron` (kit) **and `TuiDropdown` (core)**.
- Boolean textfield inputs (`readonly`, `disabled`, `invalid`) are typed `@Input`s — **bind** them
  (`[readonly]="true"`), never a bare HTML attribute. A bare `readonly` is the string `""` →
  `TS2322: Type 'string' is not assignable to type 'boolean'`. (`tuiSelect` blocks typing on its own — you
  usually need no `readonly` at all.)
- **Every `tui*` directive used in a template must appear in the component's `imports`.** A missing import on
  a *bound* directive is a build error (`NG8002` / `NG8116`), but on a **bare attribute** (`tuiInput`,
  `tuiSelect` with no `[…]`) it is **silent** — the element renders as a plain, unstyled native control and
  the build stays green. Grep every `tui*` attribute in the template against the `imports` array before
  claiming done; only the running app reveals the silent miss.

## Icons inside a control

A control that renders an icon needs **both** symbols imported — e.g. the password-reveal
`<tui-icon tuiPassword />` requires `TuiIcon` alongside `TuiPassword`. Import only the behaviour
directive and the icon element matches nothing: no build error, and the page fails at runtime with a
missing-provider error that `strictTemplates` cannot see. Same family as the barrel-array rule above.

## Sliders & progress

- Range slider: **`TuiSlider` (core)** — `<input type="range" tuiSlider [max]="100" [(ngModel)]="value" />`.
  Importing `TuiSlider` from `@taiga-ui/kit` is a build error (`has no exported member 'TuiSlider'`); kit only
  exports the composite `TuiInputSlider` (labeled input + slider). `TuiSlider` / `TuiInput` are barrel arrays —
  add them straight to `imports` (Angular flattens them).
- Progress / seek display: **`TuiProgressBar` (kit)** on a native element —
  `<progress tuiProgressBar [max]="100" [value]="value">`.

## Dialogs, confirms, notifications

- Notifications: **`TuiNotificationService`** (core). `TuiAlertService` is an abstract base and is **not provided** —
  injecting it throws `NullInjectorError` at runtime (it *compiles*, then the app is a blank page). Use
  `TuiNotificationService`. For a blocking / loading toast held across an async action, use
  `TuiNotificationMiddleService` (kit) and close it in `finally`.
- Dialogs: `TuiDialogService.open<Result>(new PolymorpheusComponent(Cmp), {data})`. Inside the dialog read input
  via `injectContext<TuiDialogContext<Result, Data>>()` and return with `context.completeWith(result)`. There is
  **no `TUI_DIALOG_DATA`** token.
- Confirm: `TUI_CONFIRM` (kit) with `TuiConfirmData` → `open<boolean>(TUI_CONFIRM, {data})`.

## Theming

- `TUI_DARK_MODE` (core) is a writable signal; `provideTaiga()` syncs it to `body[tuiTheme]`. Toggle it with a
  `TuiSwitch`.

## Value transformers

- To reshape a control's value, subclass the abstract `TuiValueTransformer` (`@taiga-ui/cdk`) and provide it via
  the control's options. There is **no `TUI_VALUE_TRANSFORMER` token and no `provideValueTransformer`**.

## Incorrect → Correct (concrete specifics)

```ts
// Incorrect: TuiAlertService compiles but is not provided → NullInjectorError at runtime (blank page)
private readonly alerts = inject(TuiAlertService);              // ✗
// Correct:
private readonly notifications = inject(TuiNotificationService); // ✓ @taiga-ui/core
```

```html
<!-- Incorrect: wrong text control + a field-error pipe that no longer exists -->
<input tuiTextfield [formControl]="email" />
<tui-error [error]="email.errors | tuiFieldError | async" />   <!-- ✗ -->
<!-- Correct: tuiInput MUST sit inside <tui-textfield>; import both (core) -->
<label tuiLabel>
  Email
  <tui-textfield><input tuiInput [formControl]="email" /></tui-textfield>
</label>
<tui-error formControlName="email" />                          <!-- ✓ messages via tuiValidationErrorsProvider (core) -->
```

```ts
// Incorrect: inventing a Material-style data token
const data = inject(TUI_DIALOG_DATA);                          // ✗ no such token
// Correct: read context inside the dialog, return via completeWith
const context = injectContext<TuiDialogContext<boolean, MyData>>(); // ✓ @taiga-ui/polymorpheus
context.completeWith(true);
```
