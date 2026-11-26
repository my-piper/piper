import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import * as YAML from "yaml";

const { readArchive } = await import("packages/node-packages/archive");
const { DataError } = await import("core-kit/types/errors");
type DataError = InstanceType<typeof DataError>;

type Files = Record<string, string>;

function archive(files: Files) {
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, content]) => [path, strToU8(content)])
      )
    )
  );
}

const MANIFEST = YAML.stringify({
  _id: "artworks",
  version: 3,
  title: "ArtWorks",
  author: "Piper",
});

const SCHEMA = YAML.stringify({
  title: "Ask LLM agent",
  execution: "regular",
  inputs: { prompt: { type: "string", title: "Prompt" } },
});

const SCRIPT = [
  'import { next } from "../node.js";',
  'import { ArtWorks } from "../utils.js";',
  "export async function run() { return next({ outputs: {} }); }",
].join("\n");

function artworks(extra: Files = {}): Files {
  return {
    "package.yaml": MANIFEST,
    "node.js": "export function next(x) { return x; }",
    "utils.js": 'import { next } from "./node.js"; export class ArtWorks {}',
    "ask_llm_agent/schema.yaml": SCHEMA,
    "ask_llm_agent/script.js": SCRIPT,
    ...extra,
  };
}

describe("reading a package archive", () => {
  it("turns each node folder into a node definition loaded from the registry", () => {
    const data = archive(artworks());

    const { nodePackage } = readArchive(data);

    expect(nodePackage._id).toBe("artworks");
    expect(nodePackage.version).toBe(3);
    expect([...nodePackage.nodes.keys()]).toEqual(["ask_llm_agent"]);
    const node = nodePackage.nodes.get("ask_llm_agent");
    expect(node._id).toBe("ask_llm_agent");
    expect(node.title).toBe("Ask LLM agent");
    expect(node.script).toBe("registry:artworks@3/ask_llm_agent/script.js");
  });

  it("uses an explicit script URL without requiring a local script", () => {
    const scriptUrl =
      "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@v2.0.4/nodes/echo/script.js";
    const data = archive({
      "package.yaml": MANIFEST,
      "echo_node/schema.yaml": YAML.stringify({
        ...YAML.parse(SCHEMA),
        scriptUrl,
      }),
    });

    const { nodePackage } = readArchive(data);

    expect(nodePackage.nodes.get("echo_node").script).toBe(scriptUrl);
    expect(nodePackage.nodes.get("echo_node")).not.toHaveProperty("scriptUrl");
  });

  it("rejects a script field in schema.yaml instead of silently ignoring it", () => {
    const data = archive(
      artworks({
        "ask_llm_agent/schema.yaml": YAML.stringify({
          ...YAML.parse(SCHEMA),
          script: "export function run() {}",
        }),
      })
    );

    const error = rejection(() => readArchive(data));

    expect(error.message).toBe(
      "schema.yaml cannot contain script; use scriptUrl or script.js"
    );
    expect(error.details).toEqual(["ask_llm_agent"]);
  });

  it.each([
    null,
    "",
    12,
    "file:///tmp/script.js",
    "https://cdn.jsdelivr.net/gh/piper/main/script.js",
    "https://evil.example/script@1.js",
  ])("rejects invalid scriptUrl %s", (scriptUrl) => {
    const data = archive(
      artworks({
        "ask_llm_agent/schema.yaml": YAML.stringify({
          ...YAML.parse(SCHEMA),
          scriptUrl,
        }),
      })
    );

    const error = rejection(() => readArchive(data));

    expect(error.message).toContain("scriptUrl must be a pinned HTTPS URL");
  });

  it("rejects mutable branches with version-looking filenames", () => {
    const scriptUrl =
      "https://raw.githubusercontent.com/org/repo/main/nodes/echo@1/script.js";
    const data = archive(
      artworks({
        "ask_llm_agent/schema.yaml": YAML.stringify({
          ...YAML.parse(SCHEMA),
          scriptUrl,
        }),
      })
    );

    const error = rejection(() => readArchive(data));

    expect(error.message).toContain("scriptUrl must be a pinned HTTPS URL");
  });

  it("prefers scriptUrl even when script.js is included", () => {
    const scriptUrl =
      "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@v2.0.4/other/script.js";
    const data = archive(
      artworks({
        "ask_llm_agent/schema.yaml": YAML.stringify({
          ...YAML.parse(SCHEMA),
          scriptUrl,
        }),
      })
    );

    const { nodePackage } = readArchive(data);

    expect(nodePackage.nodes.get("ask_llm_agent").script).toBe(scriptUrl);
  });

  it("keeps a node app inline because browsers can't reach the registry", () => {
    const data = archive(
      artworks({ "ask_llm_agent/app.html": "<h1>Agent</h1>" })
    );

    const { nodePackage } = readArchive(data);

    expect(nodePackage.nodes.get("ask_llm_agent").app).toBe("<h1>Agent</h1>");
  });

  it("publishes only package code and reports the files it leaves out", () => {
    const data = archive(
      artworks({
        ".env": "ARTWORKS_PASSWORD=secret",
        "ask_llm_agent/test.js": "Deno.test('x', () => {});",
        "ask_llm_agent/.DS_Store": "",
        "node_modules/left-pad/index.js": "module.exports = 1;",
        "__MACOSX/ask_llm_agent/._script.js": "",
        "build.sh": "rm -rf /",
      })
    );

    const { files, dropped } = readArchive(data);

    expect([...files.keys()].sort()).toEqual([
      "ask_llm_agent/schema.yaml",
      "ask_llm_agent/script.js",
      "node.js",
      "package.yaml",
      "utils.js",
    ]);
    expect(dropped.sort()).toEqual([
      ".env",
      "__MACOSX/ask_llm_agent/._script.js",
      "ask_llm_agent/.DS_Store",
      "ask_llm_agent/test.js",
      "build.sh",
      "node_modules/left-pad/index.js",
    ]);
  });

  it("rejects relative imports that resolve outside the archive", () => {
    const data = archive(
      artworks({
        "utils.js": [
          "// shared client",
          'import { next } from "../../utils/node.js";',
          "export class ArtWorks {}",
        ].join("\n"),
      })
    );

    const error = rejection(() => readArchive(data));

    expect(error.message).toBe("Archive imports files outside of it");
    expect(error.details).toEqual(["utils.js:2: ../../utils/node.js"]);
  });

  it("rejects relative imports of files the archive doesn't publish", () => {
    const data = archive(
      artworks({
        "ask_llm_agent/script.js": 'export { x } from "./helpers.js";',
      })
    );

    const error = rejection(() => readArchive(data));

    expect(error.message).toBe("Archive imports files missing from it");
    expect(error.details).toEqual(["ask_llm_agent/script.js:1: ./helpers.js"]);
  });
});

describe("package archive layout", () => {
  it("reads a package zipped together with its folder", () => {
    const files = Object.fromEntries(
      Object.entries(artworks()).map(([path, content]) => [
        `artworks/${path}`,
        content,
      ])
    );
    const data = archive({ ...files, "__MACOSX/artworks/._node.js": "" });

    const { nodePackage, files: published } = readArchive(data);

    expect(nodePackage._id).toBe("artworks");
    expect(published.has("ask_llm_agent/script.js")).toBe(true);
  });

  it.each([
    {
      name: "a file that isn't a zip",
      data: Buffer.from("not a zip"),
      message: "File is not a zip archive",
    },
    {
      name: "an archive without a manifest",
      data: archive({ "ask_llm_agent/schema.yaml": SCHEMA }),
      message: "Archive has no package.yaml",
    },
    {
      name: "an archive without nodes",
      data: archive({ "package.yaml": MANIFEST }),
      message: "Archive has no nodes",
    },
  ])("rejects $name", ({ data, message }) => {
    const error = rejection(() => readArchive(data));

    expect(error.message).toBe(message);
  });

  it.each([1.5, 0, -1, "3"])(
    "rejects version %s because registry paths need a positive integer",
    (version) => {
      const data = archive(
        artworks({
          "package.yaml": YAML.stringify({ _id: "artworks", version }),
        })
      );

      const error = rejection(() => readArchive(data));

      expect(error.message).toBe("Package version must be a positive integer");
    }
  );

  it("rejects a package that would shadow the built-in core package", () => {
    const data = archive(
      artworks({
        "package.yaml": YAML.stringify({
          ...YAML.parse(MANIFEST),
          _id: "core",
        }),
      })
    );

    expect(() => readArchive(data)).toThrow(
      "core is built into Piper and can't be uploaded"
    );
  });

  it("rejects a node folder without a script", () => {
    const data = archive({
      "package.yaml": MANIFEST,
      "ask_llm_agent/schema.yaml": SCHEMA,
    });

    const error = rejection(() => readArchive(data));

    expect(error.message).toBe("Node has no script.js");
    expect(error.details).toEqual(["ask_llm_agent"]);
  });

  it("rejects an archive that unpacks beyond the size limit", () => {
    const data = archive(
      artworks({ "big.json": "0".repeat(21 * 1024 * 1024) })
    );

    const error = rejection(() => readArchive(data));

    expect(error.message).toBe("Archive unpacks to more than 20 MB");
  });

  it("leaves out entries with absolute or parent paths", () => {
    const data = archive(
      artworks({ "/etc/evil.js": "x", "ask_llm_agent/../../evil.js": "x" })
    );

    const { files, dropped } = readArchive(data);

    expect([...files.keys()].some((p) => p.includes("evil"))).toBe(false);
    expect(dropped.sort()).toEqual([
      "/etc/evil.js",
      "ask_llm_agent/../../evil.js",
    ]);
  });
});

describe("remote imports in a package archive", () => {
  it.each([
    "https://deno.land/x/imagescript@1.2.15/mod.ts",
    "https://deno.land/std@0.224.0/fmt/colors.ts",
    "https://esm.sh/lodash-es@4.17.21",
    "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@v2.0.4/utils/node.js",
    "jsr:@std/encoding@1.0.5/base64",
    "npm:sharp@0.33.5",
  ])("accepts %s because its code can't change", (specifier) => {
    const data = archive(
      artworks({ "utils.js": `import * as m from "${specifier}";` })
    );

    const { files } = readArchive(data);

    expect(files.has("utils.js")).toBe(true);
  });

  it.each([
    {
      specifier: "https://deno.land/x/imagescript/mod.ts",
      message: "Archive imports remote modules without a pinned version",
    },
    {
      specifier: "npm:sharp",
      message: "Archive imports remote modules without a pinned version",
    },
    {
      specifier: "http://deno.land/x/imagescript@1.2.15/mod.ts",
      message: "Archive imports modules Deno can't load",
    },
    {
      specifier: "https://evil.example.com/x@1.0.0/mod.js",
      message: "Archive imports modules Deno can't load",
    },
    {
      specifier: "lodash",
      message: "Archive imports modules Deno can't load",
    },
  ])("rejects $specifier", ({ specifier, message }) => {
    const data = archive(
      artworks({ "utils.js": `import * as m from "${specifier}";` })
    );

    const error = rejection(() => readArchive(data));

    expect(error.message).toBe(message);
    expect(error.details).toEqual([`utils.js:1: ${specifier}`]);
  });
});

function rejection(action: () => unknown): DataError {
  try {
    action();
  } catch (e) {
    return e as DataError;
  }
  throw new Error("Expected the archive to be rejected");
}
