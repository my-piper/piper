import {
  nodesWithRegistryImports,
  toRegistryImports,
} from "packages/registry/registry-imports";
import { describe, expect, it } from "vitest";

const HOSTS = ["http://host.docker.internal:8085", "http://registry:8085/"];

describe("registry imports in stored scripts", () => {
  it("turns imports from a registry host into registry references", () => {
    const script = [
      'import { next } from "http://host.docker.internal:8085/artworks/3/node.js";',
      "import { ArtWorks } from 'http://registry:8085/artworks/3/utils.js';",
      'const here = "http://registry:8085/artworks/3/translate_text/script.js";',
    ].join("\n");

    const migrated = toRegistryImports(script, HOSTS);

    expect(migrated).toBe(
      [
        'import { next } from "registry:artworks@3/node.js";',
        "import { ArtWorks } from 'registry:artworks@3/utils.js';",
        'const here = "registry:artworks@3/translate_text/script.js";',
      ].join("\n")
    );
  });

  it.each([
    'import { x } from "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@v2/utils/node.js";',
    'const text = "see http://registry:8085/artworks/3/node.js for details";',
    'import { x } from "http://registry:8085/node.js";',
    'import { x } from "http://registry:80851/artworks/3/node.js";',
    'const raw = "http://registry:8085/artworks/3/echo_node/data.json?raw";',
    'const spaced = "http://registry:8085/artworks/3/echo_node/a%20b.js";',
    'import { x } from "http://registry:8085/artworks/0/node.js";',
  ])("leaves other strings as they are: %s", (script) => {
    const migrated = toRegistryImports(script, HOSTS);

    expect(migrated).toBe(script);
  });

  it("migrates only the inline scripts of a pipeline's nodes", () => {
    const nodes = {
      edited: {
        script:
          'import { next } from "http://registry:8085/artworks/3/node.js";',
      },
      published: { script: "registry:artworks@3/translate_text/script.js" },
      remote: { script: "http://registry:8085/artworks/3/x/script.js" },
      inline: { script: "export async function run() {}" },
      empty: {},
    };

    const changed = nodesWithRegistryImports(nodes, HOSTS);

    expect(changed).toEqual({
      edited: 'import { next } from "registry:artworks@3/node.js";',
    });
  });
});
