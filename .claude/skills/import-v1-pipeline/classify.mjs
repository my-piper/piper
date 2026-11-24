// Lists every Node of Piper v1 Pipeline YAMLs with what blocks it from running
// in this Piper. Run from backend/ (it resolves `yaml` from there):
//   node ../.claude/skills/import-v1-pipeline/classify.mjs <v1.yaml>...
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const { parse } = createRequire(path.join(process.cwd(), "package.json"))(
  "yaml",
);

const seen = new Map(); // script hash → ["<file>:<key>"]
const rows = [];

for (const file of process.argv.slice(2)) {
  const doc = parse(fs.readFileSync(file, "utf8"));
  const name = path.basename(file);
  for (const [key, node] of Object.entries(doc.nodes ?? {})) {
    const script = node.script ?? "";
    const hash = createHash("sha1").update(script).digest("hex").slice(0, 8);
    // a Node without a script is no copy of another
    if (script.trim()) {
      seen.set(hash, [...(seen.get(hash) ?? []), `${name}:${key}`]);
    }

    const modules = [
      ...new Set(
        [...script.matchAll(/require\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ),
    ];
    const reads = [
      ...new Set(
        [...script.matchAll(/env\.variables\??\.get\(\s*['"]([^'"]+)/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    const flags = [
      /n8n/i.test(script) && "n8n",
      /nested\.(run|state)/.test(script) && "nested",
      // a name, a template literal or a concatenation: anything but one quoted literal
      /require\(\s*(?!['"][^'"]*['"]\s*\))/.test(script) && "dynamic-require",
      /\bmessage\(/.test(script) && "message",
    ].filter(Boolean);

    rows.push({
      pipeline: name,
      key,
      kind: node.package
        ? `package ${node.package}/${node._id ?? key}`
        : "user",
      require: modules.join(","),
      env: [
        ...new Set([...reads, ...Object.keys(node.environment ?? {})]),
      ].join(","),
      flags: flags.join(","),
      hash,
    });
  }
}

for (const row of rows) {
  const copies = (seen.get(row.hash) ?? []).filter(
    (at) => at !== `${row.pipeline}:${row.key}`,
  );
  console.log(
    [
      row.pipeline,
      row.key,
      row.kind,
      row.require && `require=${row.require}`,
      row.env && `env=${row.env}`,
      row.flags && `flags=${row.flags}`,
      copies.length && `same-script=${copies.join(";")}`,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}
