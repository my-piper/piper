# Capability map — intent → primitive

Pick by behaviour, not by looks. The middle column is the **reflex to catch yourself in**: these are
the shapes a model reaches for out of habit from plain HTML or another library, and every one of them
is a worse version of something Taiga ships. Confirm the exact selector, import and package from the
live source before writing markup; concrete symbols are in [facts.md](facts.md).

| Need | The reflex to resist | Reach for |
|---|---|---|
| Single-line text / number input | `<input>` + your own label and error markup | textfield wrapper + a `tui*` control directive on a native `<input>` |
| Multi-line input | bare `<textarea>` | the same wrapper + the textarea control directive |
| Pick one from a list | hand-built dropdown of `<div>`s, or `<select>` | a select / combobox control + a data-list dropdown, filtered by the input |
| On/off toggle | styled native checkbox | a checkbox or switch CVA directive, driven through a form control |
| One-of-many choice | a group of hand-written radio rows | the radio-list component with `[items]` |
| Range / seek value | `<input type="range">` + custom CSS | the range-slider directive on that native input |
| Button / async action | a spinner you swap in next to the button | the button directive + its loading input |
| Modal with custom content | `@if` overlay, or CDK overlay | the dialog service + Polymorpheus content ([overlays.md](overlays.md)) |
| Ask the user to confirm | writing a yes/no dialog component | the built-in confirm token through the dialog service |
| Transient success / error message | fixed-position div + `setTimeout` | the notification service — queued and positioned for you |
| Blocking "working…" state | full-screen spinner div | the loading-notification service, closed in `finally` |
| Dropdown / tooltip on an element | `document.addEventListener` for click-outside | the dropdown / hint directive (and the CDK active-zone pair when you own the logic) |
| Input mask (phone, card, date) | keydown regex filtering | Maskito ([platform.md](platform.md)) |
| Validation messages | `@if (control.errors?.required)` chains | the error element + a validation-messages provider ([forms.md](forms.md)) |
| Custom form control | a 40-line `ControlValueAccessor` | the CDK control base class ([platform.md](platform.md)) |
| Loading placeholder | hand-rolled shimmer CSS | the skeleton directive on the real element |
| Truncating long text | `text-overflow` fights | the fade / line-clamp primitives |
| Card, page header, row, empty state | bespoke flex / grid + CSS | the layout primitives ([styling.md](styling.md)) |
| Responsive layout | `@media` + a second DOM for mobile | one DOM, restyled per breakpoint via Taiga's breakpoint signal / mobile state |
| Colours, spacing, radii | hex literals and magic paddings | `--tui-*` design tokens, and `appearance` for component colour |
| Dark / light theme | your own theme service + class toggle | the dark-mode signal the root provider syncs |
| `preventDefault` / `stopPropagation` | `$event.preventDefault()` in the handler | the event-plugin modifiers ([platform.md](platform.md)) |
| Browser globals in a component | `window.` / `localStorage.` directly | the injectable platform tokens ([platform.md](platform.md)) |
| A configurable content slot | forking the component per content variant | a `PolymorpheusContent` input |

If you can't find a row for a need, assume Taiga has it and search the live source before hand-rolling
markup and CSS — "if you think Taiga can't do something, you're probably wrong." Then style it with the
ladder in [styling.md](styling.md), not bespoke CSS.

> **Composite components do exist.** The rule "controls are directives on native elements" is about the
> plain text-like controls. Taiga also ships genuine composite *elements* for compound widgets — a
> chip input, an inline-editable input, a range pair, a card-group, avatar stacks. Don't invent one, but
> don't assume a `<tui-*>` element is always wrong either: check the live source.
