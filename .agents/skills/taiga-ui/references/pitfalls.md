# Pitfalls: the anti-hallucination checklist (durable categories)

Run through this before finishing any Taiga UI code. These are durable *classes* of error; the concrete
instances live in [facts.md](facts.md), but always prefer the live source.

1. **Wrong package for a symbol.** The #1 compile error. Confirm every import against the import map
   (`get_overview` / `llms-full.txt`). Symbols move between packages across versions — never guess.
2. **A control written as a custom tag instead of a directive on a native element.** A sign of recalling
   an older major.
3. **A barrel array imported as if it were a single class** — the label / clear button / dropdown then
   silently don't work.
4. **Native attribute instead of a form binding on a control.** `[checked]` / `[value]` on a Taiga
   control leaves it display-only — the value never binds to the form; bind `[formControl]` / `[(ngModel)]` (see [forms.md](forms.md)).
5. **Inventing a token, pipe, or service** by analogy to another library or an older major (e.g. a
   `*_DATA` dialog token, a field-error pipe). Confirm it exists before using it.
6. **Copying demo-only imports** (internal `@demo/*` helpers) from documentation examples into a real app.
7. **Missing app-level prerequisites** (root wrapper, root provider, icon assets) when nothing renders or
   portalled UI never appears — that is [`taiga-ui-setup`](../../taiga-ui-setup/SKILL.md), not a code fix.
8. **"Compiles" is not "works".** Some wrong choices type-check but fail at runtime — a service that
   isn't provided throws `NullInjectorError` (blank page); an unbound control renders disabled. Run the
   app, not just the build.
9. **Heavy logic / arrow functions in templates.** Move it to the class (a signal, a `computed`, or a
   method).
10. **Hand-rolling what Taiga ships** — bespoke `<div>` + CSS for a card / row / loader / mobile layout.
    Reach for the primitive and configure it (see [styling.md](styling.md)) before writing CSS.

## Quick self-review (grep your own diff)

Durable red flags — any hit is a smell to re-check against the live source (concrete patterns in
[facts.md](facts.md)):

- `<tui-` on something that should be a directive-on-native control (e.g. an input) → wrong shape.
- `[checked]=` / `[value]=` on a `tui*` control → display-only, value never binds; bind a form control.
- `ngClass` / `ngStyle` → use `[class.x]` / `[style.p]`.
- `provideAnimations` / manually registered event plugins → the root provider does this.
- an `*_DATA` / `*_DIALOG_DATA` token, or a `*FieldError` pipe → confirm it exists; usually it doesn't.
- `[showLoader]` on a button → the input is `[loading]` (and needs the loading directive imported).
- `$event.preventDefault()` / `stopPropagation()` in a handler → use an event modifier ([platform.md](platform.md)).
- `document.addEventListener` for click-outside, or `window.` / `localStorage.` in a component →
  a dropdown directive, the CDK active-zone pair, or an injectable platform token.
- a hand-written `ControlValueAccessor` → extend the CDK control base instead.
- `@media` plus a second mobile DOM → one DOM, restyled per breakpoint.
- an import whose package you did not confirm against the import map.

## After you generate — verify, don't claim

"Compiles" is not "works", so close the loop before reporting done:

- Run the project's build and lint (e.g. `ng build`, `ng lint`); where a generator supports it,
  `--dry-run` first. Read back every file you generated against the checklist above.
- Report only what you observed. If you did not run the build or the app, say "not verified yet" — never
  state a result you didn't measure.

## Incorrect → Correct (durable patterns)

The concrete symbol pairs live in [facts.md](facts.md); these are the durable,
version-independent shapes.

```html
<!-- Incorrect: a control written as a custom element (recalling an older major or another library) -->
<tui-checkbox [(ngModel)]="urgent"></tui-checkbox>
<!-- Correct: a tui* control directive on a native element -->
<input tuiCheckbox type="checkbox" [(ngModel)]="urgent" />
```

```html
<!-- Incorrect: a native attribute leaves a Taiga CVA control display-only (value never binds to the form) — and it compiles cleanly -->
<input tuiCheckbox type="checkbox" [checked]="urgent" />
<!-- Correct: drive it through a form control -->
<input tuiCheckbox type="checkbox" [formControl]="urgentControl" />
```

```html
<!-- Incorrect --> <div [ngClass]="{active: isActive}"></div>
<!-- Correct   --> <div [class.active]="isActive"></div>
```
