import "reflect-metadata";
import ajv from "app/ajv";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { Pipeline } from "models/pipeline";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { checkScriptUrl } from "packages/node-packages/script-url";
import SCHEMAS from "schemas/compiled.json" with { type: "json" };
import ts from "typescript";
import { parse } from "yaml";

type PreparedNode = {
  source?: string;
  package?: string;
  catalog?: object;
  script?: string;
  environment?: Record<string, { type: string; description?: string }>;
  inputs: Record<string, { featured?: boolean }>;
  outputs: Record<string, object>;
};
type PreparedPipeline = {
  layout?: { left?: number; top?: number; zoom?: number };
  start: { nodes: string[] };
  nodes: Record<string, PreparedNode>;
  flows: Record<
    string,
    { from: string; output: string; to: string; input: string }
  >;
  inputs: Record<
    string,
    { flows?: Record<string, { to: string; input: string }> }
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

function scriptProblems(script: string, declared: Set<string>): string[] {
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
    try {
      checkScriptUrl(value);
    } catch {
      errors.add(
        "imports must be pinned supported HTTPS URLs or node: builtins; embed local helpers"
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

/** Read-only checks for the inline, current-format output of the migration skill. */
export function validatePreparedPipeline(source: string) {
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

  const restored = toPlain(toInstance(pipeline, Pipeline)) as PreparedPipeline;
  const zoomed = { ...restored, layout: { ...restored.layout, zoom: 1 } };
  if (!validateSchema(zoomed))
    errors.push(
      "pipeline becomes schema-invalid after model conversion and an editor zoom update"
    );
  for (const [key, node] of Object.entries(pipeline.nodes)) {
    if (node.source !== "script" || node.package || node.catalog)
      errors.push(
        `Node ${key}: expected an inline Script Node without catalog identity`
      );
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
    for (const problem of scriptProblems(node.script ?? "", declared))
      errors.push(`Node ${key}: ${problem}`);
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
  if (!files.length) {
    console.error(
      "Usage: node --import=tsx tools/validate-prepared-pipelines.ts <prepared.yaml>..."
    );
    process.exitCode = 1;
  }
  for (const file of files) {
    try {
      const result = validatePreparedPipeline(readFileSync(file, "utf8"));
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
