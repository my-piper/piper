import "reflect-metadata";
import ajv from "app/ajv";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Pipeline } from "models/pipeline";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkScriptUrl } from "packages/node-packages/script-url";
import { parseRegistryScript } from "packages/registry/reference";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import ts from "typescript";
import { parse } from "yaml";

type EnumInput = { default?: unknown; enum?: unknown[] };
type PreparedNode = {
  source?: string;
  package?: string;
  version?: number;
  isolated?: boolean;
  catalog?: object;
  costs?: string;
  script?: string;
  environment?: Record<string, { type: string; description?: string }>;
  inputs: Record<
    string,
    EnumInput & { featured?: boolean; required?: boolean }
  >;
  outputs: Record<string, object>;
};
type PreparedPipeline = {
  script?: string;
  layout?: { left?: number; top?: number; zoom?: number };
  start: { nodes: string[] };
  nodes: Record<string, PreparedNode>;
  flows: Record<
    string,
    { from: string; output: string; to: string; input: string }
  >;
  inputs: Record<
    string,
    EnumInput & { flows?: Record<string, { to: string; input: string }> }
  >;
  outputs: Record<
    string,
    { flows?: Record<string, { from: string; output: string }> }
  >;
};

const validateSchema = ajv.compile(SCHEMAS.pipeline);
const LEGACY_NAMES = new Set([
  "OPEN_PAAS_USER",
  "OPEN_PAAS_PASSWORD",
  "PAAS_BASE_URL",
]);

// Packages an inline script may import by quoted registry reference: the
// built-in core helpers and the published artworks package's ArtWorks client.
const SHARED_PACKAGES = new Set(["core", "artworks"]);

function isSharedReference(value: string) {
  try {
    return SHARED_PACKAGES.has(parseRegistryScript(value).nodePackage);
  } catch {
    return false;
  }
}

function scriptProblems(
  script: string,
  declared: Set<string>,
  { relativeImports = false, isolated = false } = {}
): string[] {
  const errors = new Set<string>();
  const source = ts.createSourceFile(
    "node.js",
    script,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const diagnostics =
    ts.transpileModule(script, {
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      },
    }).diagnostics ?? [];
  if (
    diagnostics.some((entry) => entry.category === ts.DiagnosticCategory.Error)
  ) {
    errors.add("script has invalid JavaScript syntax");
  }

  function environmentObject(node: ts.Node): boolean {
    return (
      ts.isPropertyAccessExpression(node) &&
      ["variables", "scope"].includes(node.name.text) &&
      ts.isIdentifier(node.expression) &&
      /^env\d*$/.test(node.expression.text)
    );
  }
  function checkImport(value: string) {
    if (value.startsWith("node:")) return;
    // Package archives carry their helpers; tools/pack.js checks the paths.
    if (relativeImports && value.startsWith(".")) return;
    // The server resolves quoted registry references only in inline code, and
    // piper-deno maps bare "sharp" to its pinned npm:sharp (its ADR 0002).
    // Both load only in Worker isolation, not in a process-isolated Node:
    // that process has no registry token and no native code (ADRs 0006, 0007).
    if (!relativeImports && (value === "sharp" || isSharedReference(value))) {
      if (isolated)
        errors.add(
          `${value === "sharp" ? "sharp loads" : "registry imports load"} only in a node without isolated: true`
        );
      return;
    }
    try {
      checkScriptUrl(value);
    } catch {
      errors.add(
        "imports must be pinned supported HTTPS URLs, node: builtins, sharp or registry:core and registry:artworks helpers in inline scripts"
      );
    }
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        ["require", "message"].includes(node.expression.text)
      ) {
        errors.add(`${node.expression.text}() needs rewriting`);
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "get" &&
        environmentObject(node.expression.expression)
      ) {
        errors.add("Environment reads must use plain object properties");
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (
          node.arguments.length === 1 &&
          ts.isStringLiteralLike(node.arguments[0])
        )
          checkImport(node.arguments[0].text);
        else
          errors.add(
            "dynamic imports need a statically verifiable pinned specifier"
          );
      }
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      checkImport(node.moduleSpecifier.text);
    }
    // Billing is gone: a ported script keeps no costs function or result key.
    // Catalog scripts (relativeImports) still carry their own.
    if (
      !relativeImports &&
      (ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === "costs"
    )
      errors.add("obsolete costs needs removal");
    if (ts.isIdentifier(node) && node.text === "DEFINITIONS")
      errors.add(
        "DEFINITIONS needs rewriting to core's next, repeat and error classes"
      );
    if (ts.isIdentifier(node) && LEGACY_NAMES.has(node.text))
      errors.add(`legacy Environment name ${node.text}`);
    if (ts.isStringLiteralLike(node)) {
      if (LEGACY_NAMES.has(node.text))
        errors.add(`legacy Environment name ${node.text}`);
      if (/n8n\./i.test(node.text))
        errors.add("obsolete n8n endpoint needs removal");
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      environmentObject(node.expression) &&
      node.name.text !== "get" &&
      !declared.has(node.name.text)
    ) {
      errors.add(`Environment Variable ${node.name.text} is not declared`);
    }
    if (
      ts.isElementAccessExpression(node) &&
      environmentObject(node.expression) &&
      node.argumentExpression &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      !declared.has(node.argumentExpression.text)
    ) {
      errors.add(
        `Environment Variable ${node.argumentExpression.text} is not declared`
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const exportedRun = source.statements.some((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "run")
      return node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      );
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      )
    )
      return node.declarationList.declarations.some(
        (entry) => ts.isIdentifier(entry.name) && entry.name.text === "run"
      );
    return (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.some((entry) => entry.name.text === "run")
    );
  });
  if (!exportedRun) errors.add("script must export run");
  return [...errors];
}

/**
 * The catalog path (`<package>/<node>/script.js`) of a package node's script,
 * or null when the script is not a `<node>/script.js` of its own package. The
 * registry version is the package's; `node.version` is the node's own.
 */
function packageScriptPath(node: PreparedNode) {
  try {
    const { nodePackage, path } = parseRegistryScript(node.script ?? "");
    return nodePackage === node.package && /^[^/]+\/script\.js$/.test(path)
      ? `${nodePackage}/${path}`
      : null;
  } catch {
    return null;
  }
}

/**
 * An enum option is `value` or `value|label`, but a default is passed to the
 * script as it is, so it must be the bare value. Returns that value when the
 * default repeats a whole labelled option.
 */
function labelledDefault({ default: value, enum: options }: EnumInput) {
  if (typeof value !== "string" || !value.includes("|")) return null;
  return options?.includes(value) ? value.split("|")[0] : null;
}

/**
 * Read-only checks for the current-format output of the migration skill:
 * inline Script Nodes, and package nodes whose scripts are read from the
 * nodes catalog in `nodesDir` (its `nodes/` folder).
 */
export function validatePreparedPipeline(
  source: string,
  { nodesDir }: { nodesDir?: string } = {}
) {
  const errors: string[] = [];
  let pipeline: PreparedPipeline;
  try {
    pipeline = parse(source) as PreparedPipeline;
  } catch {
    return { errors: ["Invalid pipeline YAML"], nodes: 0, links: 0 };
  }
  if (!validateSchema(pipeline)) {
    return {
      errors: (validateSchema.errors ?? []).map(
        (error) => `${error.instancePath || "/"}: ${error.message}`
      ),
      nodes: 0,
      links: 0,
    };
  }
  if (
    !Number.isFinite(pipeline.layout?.left) ||
    !Number.isFinite(pipeline.layout?.top)
  ) {
    errors.push(
      "layout must explicitly include numeric left and top before the first editor save"
    );
  }

  if (pipeline.script && /\bcosts\b/.test(pipeline.script))
    errors.push("pipeline script with obsolete costs needs removal");

  const restored = toPlain(toInstance(pipeline, Pipeline)) as PreparedPipeline;
  const zoomed = { ...restored, layout: { ...restored.layout, zoom: 1 } };
  if (!validateSchema(zoomed))
    errors.push(
      "pipeline becomes schema-invalid after model conversion and an editor zoom update"
    );
  for (const [key, node] of Object.entries(pipeline.nodes)) {
    const catalogPath = node.package ? packageScriptPath(node) : null;
    if (node.package) {
      if (node.source !== "node")
        errors.push(`Node ${key}: a package node needs source: node`);
      if (node.catalog)
        errors.push(`Node ${key}: a package node can't keep catalog identity`);
      if (node.isolated)
        errors.push(
          `Node ${key}: a registry script can't run with isolated: true`
        );
      if (!catalogPath)
        errors.push(
          `Node ${key}: a package node's script must be registry:${node.package}@<package version>/<node>/script.js`
        );
    } else if (node.source !== "script" || node.catalog)
      errors.push(
        `Node ${key}: expected an inline Script Node or a package node without catalog identity`
      );
    if (node.costs !== undefined)
      errors.push(`Node ${key}: obsolete costs needs removal`);
    const declared = new Set(Object.keys(node.environment ?? {}));
    for (const name of declared)
      if (LEGACY_NAMES.has(name))
        errors.push(`Node ${key}: legacy Environment declaration ${name}`);
    const retained = Object.keys(restored.nodes[key]?.environment ?? {});
    if (
      retained.length !== declared.size ||
      retained.some((name) => !declared.has(name))
    )
      errors.push(
        `Node ${key}: Environment declarations do not survive model conversion`
      );
    if (!node.package)
      for (const problem of scriptProblems(node.script ?? "", declared, {
        isolated: node.isolated,
      }))
        errors.push(`Node ${key}: ${problem}`);
    else if (catalogPath && !nodesDir)
      errors.push(
        `Node ${key}: set PIPER_NODES_DIR to the nodes catalog checkout to check ${catalogPath}`
      );
    else if (catalogPath && nodesDir) {
      const file = join(nodesDir, catalogPath);
      if (!existsSync(file))
        errors.push(`Node ${key}: ${catalogPath} is missing from the catalog`);
      else
        for (const problem of scriptProblems(
          readFileSync(file, "utf8"),
          declared,
          { relativeImports: true }
        ))
          errors.push(`Node ${key}: ${problem}`);
    }
    for (const [name, input] of Object.entries(node.inputs)) {
      const value = labelledDefault(input);
      if (value !== null)
        errors.push(
          `Node ${key}: input ${name} default must be the enum value ${value}, not the whole option`
        );
    }
  }
  for (const [name, input] of Object.entries(pipeline.inputs)) {
    const value = labelledDefault(input);
    if (value !== null)
      errors.push(
        `Pipeline input ${name}: default must be the enum value ${value}, not the whole option`
      );
  }

  // A required input without a default that nothing feeds holds its node
  // back forever (checkInputs), and everything downstream with it: v1 kept
  // such values in saved node inputs that its export dropped. A node nothing
  // reaches never runs, so it can't wait.
  const fed = new Set<string>();
  for (const flow of Object.values(pipeline.flows ?? {}))
    fed.add(`${flow.to}.${flow.input}`);
  for (const input of Object.values(pipeline.inputs ?? {}))
    for (const flow of Object.values(input.flows ?? {}))
      fed.add(`${flow.to}.${flow.input}`);
  const reached = new Set([
    ...pipeline.start.nodes,
    ...[...fed].map((port) => port.split(".")[0]),
  ]);
  for (const [key, node] of Object.entries(pipeline.nodes)) {
    if (!reached.has(key)) continue;
    for (const [name, input] of Object.entries(node.inputs))
      if (
        input.required &&
        input.default === undefined &&
        !fed.has(`${key}.${name}`)
      )
        errors.push(
          `Node ${key}: required input ${name} has no default and nothing feeds it, so the node never runs`
        );
  }

  let links = 0;
  function inputPort(to: string, input: string) {
    if (!pipeline.nodes[to]?.inputs[input]?.featured)
      errors.push(
        `Connected input ${to}.${input} must exist and have featured: true; the editor removes its links`
      );
  }
  function outputPort(from: string, output: string) {
    if (!pipeline.nodes[from]?.outputs[output])
      errors.push(`Connected output ${from}.${output} does not exist`);
  }
  for (const flow of Object.values(pipeline.flows)) {
    links++;
    inputPort(flow.to, flow.input);
    outputPort(flow.from, flow.output);
  }
  for (const input of Object.values(pipeline.inputs))
    for (const flow of Object.values(input.flows ?? {})) {
      links++;
      inputPort(flow.to, flow.input);
    }
  for (const output of Object.values(pipeline.outputs))
    for (const flow of Object.values(output.flows ?? {})) {
      links++;
      outputPort(flow.from, flow.output);
    }
  for (const key of pipeline.start.nodes)
    if (!pipeline.nodes[key]) errors.push(`Start node ${key} does not exist`);
  return {
    errors: [...new Set(errors)],
    nodes: Object.keys(pipeline.nodes).length,
    links,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const files = process.argv.slice(2);
  // The nodes catalog checkout (gitlab realistic-ai/piper/nodes).
  const catalog = process.env["PIPER_NODES_DIR"];
  const nodesDir = catalog ? join(catalog, "nodes") : undefined;
  if (!files.length) {
    console.error(
      "Usage: node --import=tsx tools/validate-prepared-pipelines.ts <prepared.yaml>..."
    );
    process.exitCode = 1;
  }
  for (const file of files) {
    try {
      const result = validatePreparedPipeline(readFileSync(file, "utf8"), {
        nodesDir,
      });
      console.log(
        `${file}: ${result.errors.length ? "INVALID" : "valid"} (${result.nodes} nodes, ${result.links} links)`
      );
      for (const error of result.errors) console.error(`  ${error}`);
      if (result.errors.length) process.exitCode = 1;
    } catch {
      console.error(`${file}: could not read or validate pipeline`);
      process.exitCode = 1;
    }
  }
}
