# Styling — aim for zero CSS

Taiga UI is a design system: most visual needs are a **configuration**, not a stylesheet. Climb this
ladder and **stop at the first rung that works** — reaching for hand-written CSS first usually means you
skipped one.

1. **A layout primitive / component.** Cards, headers, lists, cells, forms, titles, groups — use the
   primitive instead of a `<div>` + flexbox. If you're writing flexbox to lay out a
   title / subtitle / actions row, you missed one.
2. **An `appearance` input.** Appearances are the **colour system** — never put a colour class on a
   component that exposes an `appearance` input; pick the appearance instead.
3. **An option provider.** Restyle a whole subtree with zero CSS ("every button in here is this size /
   appearance") via the component's options provider in `providers`, instead of repeating the same
   attributes on each instance.
4. **A `--tui-*` design token.** Override the theme token in the theme sheet rather than a raw colour;
   brand colours live only there.
5. **A shared utility class** for a genuinely repeated one-off.
6. **A few lines of `:host` layout CSS** — spacing / grid that is truly local. Prefer logical properties
   (`inline-size`, `margin-block-end`) and get vertical rhythm from `:host { display: grid; gap: … }`.

Avoid `::ng-deep` and `!important` — both signal that a rung was skipped. For responsive layouts, restyle
**one** DOM per breakpoint (Taiga's breakpoint signals or a `_mobile` state class), never ship duplicated
desktop / mobile markup.
