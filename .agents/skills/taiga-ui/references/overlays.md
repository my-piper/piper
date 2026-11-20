# Overlays — dialogs, confirms, notifications, dropdowns, hints

Durable shapes; confirm exact service / token names from the live source (or [facts.md](facts.md)
offline). All of these render into the root component's portal layer — if nothing appears, the root
wrapper / provider is missing, which is [`taiga-ui-setup`](../../taiga-ui-setup/SKILL.md)'s job, not a code bug.

## Dialogs (custom content)

Open through the injected **dialog service** with Polymorpheus content — a component (or template)
reference plus options. Inside the dialog, read inputs via the injected **context** and return a result
by completing that context. There is **no Material-style data token**.

- Pass data through the options; read it from the injected context inside the dialog component.
- Return a value by completing the context; cancel by completing it with nothing.
- The dialog component needs no selector — it is instantiated by the service, not placed in a template.

## Confirm

Don't hand-roll a yes/no dialog. Open the built-in **confirm** token through the dialog service with its
data (label, buttons) and act on the boolean result it resolves to.

## Notifications / toasts

Open through the injected **notification service**. Do **not** inject the abstract base *alert* service —
it type-checks but is not provided, so the app is a blank page at runtime. For a blocking / loading
notification held open across an async action, use the dedicated loading-notification service and close it
in `finally`.

## Dropdowns & hints

Attach a **dropdown** or **hint** directive to the host element. Dropdown content is a data-list (or any
template) rendered in the dropdown portal, with a context-provided close handler you call on selection.
Tune appearance and behaviour globally with option providers rather than per-instance markup — see
[styling.md](styling.md).
