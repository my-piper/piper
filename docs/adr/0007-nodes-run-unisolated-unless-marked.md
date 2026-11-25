# Nodes run without isolation unless marked, and no Node is signed

Supersedes ADR 0004.

Piper is now an internal tool, so we trust everyone who can edit a Pipeline with the code it runs. Before this, the server issued a sign over each Node's script and Environment scopes. A signed Node ran in Deno without process isolation (`isolation: "none"`). Saving a Pipeline whose Nodes didn't match their signs was rejected unless an engineer saved it, and a Script Node was always isolated and read no Environment. All of that is gone. Every Node, Script Nodes included, runs without isolation. A Node runs in its own process only when it carries `isolated: true`. A Node Definition can carry the mark and passes it on to the Nodes placed from it, and anyone who edits a Pipeline can turn it on or off for a Node there.

We considered keeping the sign as a guard against tampering (checking scripts and scopes against the catalog), and keeping Script Nodes isolated by default. Both protect against the Pipeline's own editors, and inside one organisation they cost more than they protect: every script edit needed an engineer or a server round trip, and a Script Node couldn't use an API key.

## Consequences

- Anyone who can edit a Pipeline can change any Node's script and the Environment scopes it reads, including `global`. The server no longer checks them on save, import or the assistant's changes.
- A Node without isolation runs in the Deno server's shared process, so its script could read the Variables of other Launches running at the same time (ADR 0006). Mark a Node isolated when that matters.
- Script Nodes may declare Variables and read the Environment like any other Node, and their script may be a `registry:` or `https://` reference. An isolated Node still can't load a `registry:` script, because its process has no registry token (ADR 0006).
- Publishing a Node to the catalog (`POST /api/nodes`) needs the engineer role instead of a valid sign. The catalog still reserves the id `script`.
- Stored signs are removed by a migration. An imported Pipeline or Package may still carry `sign`, which is dropped.
