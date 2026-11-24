# Piper v1 scripts are imported behind a compatibility prelude, not rewritten

A Node a user wrote in Piper v1 calls runtime globals the current Deno runtime doesn't have: `DEFINITIONS.NextNode`/`RepeatNode`/errors, `httpClient`, `download`, `Buffer`, and `nested.run`/`nested.state` to run another Deploy and poll it. Importing such a Pipeline turns the Node into a Script Node whose script is the v1 code unchanged, with a prelude in front that defines those globals and wraps `run`. We chose this over rewriting the script text into current idioms. A rewrite would have to recognise every way a user wrote a `nested` call, and a pattern it missed would break silently. The prelude keeps each v1 script's own logic byte for byte and is tested once.

`nested` maps onto Child Launches (ADR 0001) without a call back into Piper. `nested.run` counts its calls per run, uses the count as the child's key, and asks for a Child Launch only when `children` has no child under that key. A `launch` result doesn't save `state`, so the run after it repeats v1's first step: `nested.run` then finds its child and v1's own `RepeatNode` saves the state. `nested.state` reads the child's outputs from `children`.

## Consequences

- An imported v1 Script Node carries about 100 lines of prelude its user can see and edit. Removing the prelude breaks a script that still uses a v1 global.
- What a Script Node can't do at all (ADR 0004), such as reading the Environment or `require`-ing a module, can't be shimmed. The import reports those Nodes and saves nothing.
- The prelude keeps its bindings in module state, which is safe only because a Script Node runs in its own process.
- The child key of a v1 `nested.run` call depends on the order of the calls, so a v1 script must make the same `nested.run` calls on every run until its children exist. The v1 pattern of starting a child and then polling it does.
