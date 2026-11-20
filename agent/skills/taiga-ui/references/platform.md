# Platform features — what you get for free

Taiga ships more than components: event modifiers, a control base class, DI helpers, masking and
content projection. Each one replaces code a model would otherwise hand-write. Verified against the
published typings and `llms-full.txt`; confirm anything you extend from the live source.

## Event modifiers (no imports needed)

`provideTaiga()` installs the event plugins, so template bindings take modifiers directly:

```html
<form (submit.prevent)="save()">            <!-- no $event.preventDefault() in the handler -->
<button (click.stop)="toggle()">            <!-- stopPropagation -->
<div (click.self)="close()">                <!-- only when the target is this element -->
<div (scroll.zoneless)="track($event)">     <!-- skip change detection on hot events -->
```

`.capture` and `.once` work the same way. Writing `$event.preventDefault()` or
`$event.stopPropagation()` in a handler is a sign the modifier was missed. These are also why
`provideTaiga()` must not be replaced by `provideAnimations()` plus a manual plugin list.

## Custom form controls — extend the CDK base, don't write a CVA

For a control Taiga doesn't ship, extend the abstract control base class from `@taiga-ui/cdk` and
register it with the matching `tuiAsControl(MyControl)` provider. The base gives you the value model,
`disabled` / `invalid` / `readonly` / `touched` inputs and the `touch` output — the boilerplate a
hand-written `ControlValueAccessor` spends forty lines on. To reshape stored ↔ displayed values,
subclass the CDK value transformer and provide it through the control's options rather than mapping in
the component.

## DI helpers for your own components

- `tuiProvide(TOKEN, UseExisting)` — the alias provider, instead of a hand-written `useExisting` literal.
- `tuiCreateOptions(defaults)` returns a `[token, provider]` pair, so your own component gets exactly
  the configuration story Taiga's own components have: defaults in DI, overridden per subtree by a
  provider in `providers`. Reach for this when a component grows more than two or three style inputs.

## Masking

Real masking (phone, card, date, amount) is Maskito (`@maskito/*`): put the directive on the native
input and pass options, using the generators for numbers, dates and times rather than writing a regex.
It handles paste, autofill and predictive keyboards — keydown filtering does not.

## Polymorpheus is not only for dialogs

`PolymorpheusContent` is the type behind every `content` / `label` / `itemContent` input in the library:
it accepts a string, a function of the context, a template or a component. Two consequences:

- Inside a component created by a service (a dialog body, a dropdown item), read the live context with
  `injectContext<…>()` — see [overlays.md](overlays.md).
- In **your own** components, declare a `PolymorpheusContent` input instead of forking the component for
  each content variant, and render it with the polymorpheus outlet.

## Responsiveness and platform state

Prefer injectable state over reading the DOM: Taiga's breakpoint signal for layout decisions, and the
`@ng-web-apis` platform tokens (mobile / iOS / reduced-motion) over `navigator.userAgent` sniffing.
Browser globals have tokens too (window, location, storage) — injecting them keeps a component testable
and SSR-safe, which `window.` and `localStorage.` do not. For the CSS side of responsiveness, see
[styling.md](styling.md): one DOM restyled per breakpoint, never a second mobile DOM.

## Click-outside and focus-left

When a dropdown or hint directive isn't enough and you genuinely own the behaviour, use the CDK's
active-zone and obscured directives. `document.addEventListener('click')` plus manual teardown is the
antipattern they exist to replace.

## Display helpers worth knowing before writing CSS

A loading placeholder is the skeleton directive on the real element, not a shimmer div. Truncation is the
fade directive or the line-clamp component, not a `text-overflow` fight. Both save more CSS than they
cost to look up.
