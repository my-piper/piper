# Script Nodes run unsigned, process-isolated and without an Environment

Any user who can edit a Project can place a Script Node and write its script. Until now only engineers could change a Node's script. Every script carries a sign that the server issues, and the sign decides two things: a signed Node runs in Deno without process isolation (`isolation: "none"`), and the sign also covers the Environment scopes the Node may read. A Script Node gets neither. Saving a Pipeline drops its sign and its declared Environment. At run time, a sign on it is ignored and it reads no Environment, so a Pipeline written by a path that skips the sign check (project create or import) can't lift those limits either.

We considered keeping Script Nodes engineer-only, under the existing sign rule. Most users could then place one but not write its script, which defeats the feature. Process isolation is what contains untrusted code. The sign only marks code an engineer has reviewed.

## Consequences

- A Script Node can't read API keys from an Environment. It gets values only through its inputs. Declaring Variables on a Script Node would need a reviewed path, such as publishing it as a Node Package.
- A Script Node must hold inline code. A patch that points its script at a `registry:` or `https://` reference is rejected, so no one can run a published package's code under this exemption.
- The catalog reserves the id `script`: neither `POST /api/nodes` nor a Node Package may publish a Node under it.
- The rule is keyed on `source: "script"`. A user who sets that on any Node in their Pipeline gets the same limits, not more trust.
- Publishing a Script Node to the catalog (`POST /api/nodes`) still requires a valid sign, so only engineers can promote one.
