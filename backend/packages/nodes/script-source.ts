import { DataError } from "core-kit/types/errors";
import { parsers } from "prettier/plugins/babel";
import { resolveScript } from "packages/registry/reference";

type SyntaxNode = {
  type: string;
  start: number;
  end: number;
  value?: string;
  source?: SyntaxNode;
  callee?: SyntaxNode;
  arguments?: SyntaxNode[];
  object?: SyntaxNode;
  property?: SyntaxNode;
  meta?: SyntaxNode;
  name?: string;
  computed?: boolean;
};

// An edited module runs inline in Deno, where relative imports would otherwise
// resolve against a Blob URL. Parse it so comments and ordinary strings survive.
export async function prepareScriptSource(source: string, base: string) {
  if (!base || !/^(registry:|https?:\/\/)/.test(base)) {
    return source;
  }
  const url = resolveScript(base);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const ast = await parsers.babel.parse(source, undefined);

  function visit(node: SyntaxNode) {
    let specifier: SyntaxNode;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(node.type)
    ) {
      specifier = node.source;
    } else if (
      node.type === "CallExpression" &&
      node.callee?.type === "Import"
    ) {
      specifier = node.arguments[0];
    }
    if (specifier) {
      if (specifier.type !== "StringLiteral") {
        throw new DataError(
          "URL script overrides require string literals in dynamic imports"
        );
      }
      if (/^(\.{1,2}\/|\/)/.test(specifier.value)) {
        edits.push({
          start: specifier.start,
          end: specifier.end,
          text: JSON.stringify(new URL(specifier.value, url).href),
        });
      }
    }
    if (
      node.type === "MemberExpression" &&
      node.object?.type === "MetaProperty" &&
      node.object.meta?.name === "import" &&
      !node.computed &&
      node.property?.name === "url"
    ) {
      edits.push({
        start: node.start,
        end: node.end,
        text: JSON.stringify(url),
      });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object" && "type" in child)
            visit(child);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        visit(value as SyntaxNode);
      }
    }
  }

  visit(ast);
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, start) + text + source.slice(end);
  }
  return source;
}
