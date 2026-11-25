import { describe, expect, it, vi } from "vitest";

async function loadReference() {
  vi.resetModules();
  return import("packages/registry/reference");
}

describe("registry script references", () => {
  it("points a registry script at the configured registry", async () => {
    vi.stubEnv("REGISTRY_URL", "http://registry:8085/");
    const { resolveScript } = await loadReference();

    const url = resolveScript("registry:artworks@3/ask_llm_agent/script.js");

    expect(url).toBe("http://registry:8085/artworks/3/ask_llm_agent/script.js");
  });

  it.each([
    "https://cdn.jsdelivr.net/gh/my-piper/piper-nodes@v2.0.4/nodes/x/script.js",
    "export async function run() { return {}; }",
  ])("sends other scripts to Deno unchanged: %s", async (script) => {
    const { resolveScript } = await loadReference();

    const resolved = resolveScript(script);

    expect(resolved).toBe(script);
  });

  it("points an edited script's registry imports at the configured registry", async () => {
    vi.stubEnv("REGISTRY_URL", "http://registry:8085/");
    const { resolveScript } = await loadReference();
    const script = [
      'import { next } from "registry:artworks@3/node.js";',
      "const lazy = () => import('registry:artworks@3/echo_node/lazy.js');",
      'const here = "registry:artworks@3/echo_node/script.js";',
      'const text = "a registry:artworks@3/node.js mention";',
    ].join("\n");

    const resolved = resolveScript(script);

    expect(resolved).toBe(
      [
        'import { next } from "http://registry:8085/artworks/3/node.js";',
        "const lazy = () => import('http://registry:8085/artworks/3/echo_node/lazy.js');",
        'const here = "http://registry:8085/artworks/3/echo_node/script.js";',
        'const text = "a registry:artworks@3/node.js mention";',
      ].join("\n")
    );
  });

  it.each([
    'const tag = "registry:foo@0/a";',
    "const tag = 'registry:pkg@1/a?b';",
  ])(
    "leaves strings that aren't valid references alone: %s",
    async (script) => {
      const { resolveScript } = await loadReference();

      const resolved = resolveScript(script);

      expect(resolved).toBe(script);
    }
  );

  it.each([
    "registry:artworks/ask_llm_agent/script.js",
    "registry:artworks@3",
    "registry:artworks@three/script.js",
  ])("rejects a malformed reference %s", async (script) => {
    const { resolveScript } = await loadReference();

    const resolve = () => resolveScript(script);

    expect(resolve).toThrow(`Wrong registry script ${script}`);
  });
});
