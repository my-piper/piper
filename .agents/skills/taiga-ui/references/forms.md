# Forms and validation (the pattern)

Reactive forms are the default. This file describes the **stable shape**; confirm the exact directive /
symbol names from the live source (or [facts.md](facts.md) offline).

## The form-field shape

Every text-like field is the same shape: a **required textfield wrapper** enclosing a **native element
that carries a `tui*` control directive**, an optional label, and a sibling **error element** bound to the
control. The control directive does **not** work outside its wrapper — render and import **both** the
wrapper and the directive (they are separate symbols). Confirm the exact names from the live source —
today they are `<tui-textfield>` + `<input tuiInput>`, both from `@taiga-ui/core`.

## Bind controls through Angular forms — never the native attribute

Taiga form controls are **ControlValueAccessor directives**. Drive them through Angular forms —
`[formControl]` / `formControlName` / `[(ngModel)]`. **Do not** use the native `[checked]` / `[value]` to
reflect state: without a bound `NgControl` the value never flows through the form — the control renders
**display-only (decorative), not interactive**. This is the single most common "the control shows but I can't interact with it"
bug, and it *compiles cleanly* — only the running app reveals it.

```html
<!-- right: bound through a form control -->
<input tuiCheckbox type="checkbox" [(ngModel)]="task.done" />

<!-- wrong: native attribute -> value never binds to the form; the control is display-only, not interactive -->
<input tuiCheckbox type="checkbox" [checked]="task.done" />
```

State flags on a control (`readonly`, `disabled`, `invalid`) are **typed boolean inputs**, so **bind** them
(`[readonly]="true"`) — a bare HTML attribute passes the string `""` and fails the build with a
string-vs-boolean type error. Reach for a flag only when you need it; a fixed-choice control usually blocks
free input on its own.

## Import every directive you type

A control directive only activates if the component imports it. A missing import on a **bound** directive is
a build error, but on a **bare attribute** (a directive with no `[…]` binding) it is **silent**: the element
renders as a plain native control and the build stays green — only the running app shows the unstyled,
inert field. Before claiming done, check every `tui*` attribute in the template against the `imports` array.

## Fixed-choice (select) fields

A single-choice picker is the same textfield shape with a dropdown: the wrapper carries a chevron, the
native input carries the select control directive, and the option list is **projected into the wrapper by a
structural dropdown directive** (confirm its name live — it is a generic dropdown directive, not a
select-specific one you can guess). Bind the choice through the form control, same as any field.

## Validation messages render from a provider

The error element reads the bound control and shows a message when it is invalid and touched. Register
the messages **once** via a provider, keyed by Angular's own error keys (`required`, `email`,
`minlength`, …). No per-field pipe is needed for the common case. Confirm the provider + error-element
names live.

## Showing errors on a disabled submit

If the submit button is `[disabled]="form.invalid"`, the user can't click it to touch the fields, so
errors never appear. Either keep the button enabled and guard inside the handler, or mark every control
touched on the blocked submit attempt (there is a CDK helper for this — confirm its name live).
Marking-touched is the robust pattern.

## Accessibility

Associate each label with its input via `for` / `id`. Taiga's label directive renders a real `<label>`;
adding `for="…"` on it and a matching `id` on the input satisfies the "no associated label" a11y audit
that the bare textfield wrapper otherwise trips.

## Forms inside a dialog

A form rendered in a dialog body is the same shape — the dialog just supplies the container and the
submit/cancel wiring. See [overlays.md](overlays.md) for opening the dialog and returning its result.
