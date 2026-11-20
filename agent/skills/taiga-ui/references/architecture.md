# Architecture — the shape of Taiga UI

The mental model that stays true across majors. Confirm exact symbol names from the live source
(MCP / `llms-full.txt`, or [facts.md](facts.md) offline).

## The shape

- **Form controls are directives on native elements, wrapped by a textfield container** — not custom
  tags. A `tui*` control directive goes on a native `<input>` / `<textarea>` inside a wrapper element.
  Writing a control as a `<tui-something>` custom tag is a sign of recalling an older major.
- **DI-first.** Behaviour is configured through providers and injected **services**, not ad-hoc markup.
  Imperative UI — dialogs, notifications, confirms — is opened through injected services. Never assume a
  service name by analogy to another library (there is no Material-style `*_DATA` token).
- **Many exports are barrel arrays of directives**, not single classes. Import the whole exported symbol
  and add it straight to `imports` (Angular flattens the array) — treat it as one class and the label /
  clear button / dropdown silently don't work.
- **The app is wrapped in a root component**; portalled UI (dialogs, dropdowns, hints, notifications)
  renders into it, and **one root provider** wires the library. `taiga-ui-setup` sets both up — if portalled
  UI never appears, that wiring is what's missing.
- **Dynamic content** (dialog bodies, dropdown content) flows through Polymorpheus
  (`@taiga-ui/polymorpheus`): a component or template reference plus an injected **context**, not a data
  token.
- **Validation messages** come from a provider you register once, plus an error element bound to the
  control — see [forms.md](forms.md).

## Where symbols live

Symbols are split across packages (`core`, `kit`, `cdk`, `polymorpheus`, and addons) and **move between
them across majors** — importing from the wrong package is the #1 build error, and a wrong guess still
*looks* plausible. Confirm the owning package for every symbol against the live source before importing;
offline, use the package boundaries in [facts.md](facts.md).

## Departures that catch people (durable)

These trip anyone arriving from generic Angular, another UI library, or an older Taiga major — the
concrete symbols are in [facts.md](facts.md):

- Notifications / toasts are an **injected service**, not an alert-by-analogy; the abstract base service
  is not provided, so injecting it type-checks and then blanks the page at runtime.
- Text controls are `tui*` **directives inside a textfield wrapper**, not a `<tui-input>` element.
- The library is wired by **one root provider**, not by `provideAnimations()` plus manually registered
  event plugins.
- Native `[checked]` / `[value]` on a control-value-accessor control renders it **inert / disabled** —
  drive it through a form control instead.
