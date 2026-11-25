import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

/** Projects as MongoDB received them; the import reuses the object afterwards. */
let inserted: Record<string, unknown>[];

/** The installed Node Definitions, as `nodes` in MongoDB holds them. */
const CATALOG: Record<string, object> = {
  generate_image: {
    _id: "generate_image",
    version: 7,
    package: "artworks",
    title: "en=Generate SDXL & Flux",
    source: "node",
    execution: "regular",
    script: "registry:artworks@3/generate_image/script.js",
    isolated: true,
    catalog: { _id: "generate_image", version: 7, package: "artworks" },
    inputs: {
      prompt: { title: "Prompt", type: "string", featured: true },
      seed: { title: "Seed", type: "integer" },
    },
    outputs: { image: { title: "Image", type: "image" } },
    environment: {
      ARTWORKS_USER: { type: "string", scope: "global" },
      ARTWORKS_PASSWORD: { type: "string", scope: "global" },
    },
  },
  ask_llm_agent: {
    _id: "ask_llm_agent",
    version: 3,
    package: "artworks",
    title: "en=Ask LLM agent",
    source: "node",
    execution: "deferred",
    script: "registry:artworks@3/ask_llm_agent/script.js",
    isolated: true,
    inputs: {
      question: { title: "Question", type: "string" },
      instructions: { title: "Instructions", type: "string" },
    },
    outputs: { text: { title: "Text", type: "string" } },
    environment: {
      ARTWORKS_USER: { type: "string", scope: "global" },
      ARTWORKS_PASSWORD: { type: "string", scope: "global" },
    },
  },
  qwen_edit_image: {
    _id: "qwen_edit_image",
    version: 1,
    package: "artworks",
    title: "en=QWEN Edit image",
    source: "node",
    execution: "protracted",
    script: "registry:artworks@3/qwen_edit_image/script.js",
    isolated: true,
    inputs: {
      image1: { title: "Image 1", type: "image" },
      image2: { title: "Image 2", type: "image" },
      prompt: { title: "Prompt", type: "string" },
    },
    outputs: {
      images: { title: "Images", type: "image[]" },
      image1: { title: "Image 1", type: "image" },
    },
  },
};

beforeEach(async () => {
  httpScenario();
  inserted = [];
  httpDoubles.projects.insertOne.mockImplementation(async (project) => {
    inserted.push(structuredClone(project));
    return { acknowledged: true };
  });
  httpDoubles.nodes.findOne.mockImplementation(async ({ _id }) =>
    CATALOG[_id] ? structuredClone(CATALOG[_id]) : null
  );
  httpDoubles.nodes.find.mockImplementation((filter: { package?: string }) => ({
    toArray: async () =>
      Object.values(CATALOG)
        .filter((node) => node["package"] === filter?.package)
        .map((node) => structuredClone(node)),
  }));
  context = await createHttpApp([() => import("api/pipelines")]);
});

const V1_SIGN =
  "1529dfa70150e27dae565160e2e6a6cf626378d86d9176b94dfc333b1ca192f9";

/**
 * A Pipeline as Piper v1 shows it on a Project's YAML page: Node environment
 * declarations still carry a title, Nodes carry the sign v1 issued, and the
 * Deploy has a slug and a scope. Its Nodes are one from the `artworks`
 * package and one the user wrote, and no input is `featured`.
 */
const V1_PIPELINE_YAML = `name: Text to Video V5 (PROD) 🟢
version: 1
script: ""
start:
  nodes:
    - generate_image
deploy:
  slug: text-to-video-v5
  scope:
    id: text_to_video_v5
    activated: false
    maxConcurrent: 50
inputs:
  prompt:
    title: Prompt
    type: string
    default: cat walking on the moon
    flows:
      to_generate_image:
        to: generate_image
        input: prompt
    arrange:
      x: 10
      y: 10
outputs:
  image:
    title: Image
    type: image
    flows:
      from_moderate_image:
        from: moderate_image
        output: image
    arrange:
      x: 900
      y: 100
flows:
  generate_image_to_moderate:
    from: generate_image
    output: image
    to: moderate_image
    input: image
    mode: move
nodes:
  generate_image:
    version: 5
    category:
      _id: generate_images
      title: en=Generate images;ru=Генерация изображений
    package: artworks
    title: en=Generate image;ru=Генерация изображения
    tags:
      - artworks
    source: node
    execution: regular
    script: "export async function run({ inputs }) { return inputs; }"
    sign: ${V1_SIGN}
    locked: false
    arrange:
      x: 570
      y: 100
    inputs:
      prompt:
        order: 1
        title: en=Prompt;ru=Подсказка
        type: string
        required: true
    outputs:
      image:
        title: en=Image
        type: image
    environment:
      PAAS_BASE_URL:
        title: PaaS base url
        type: string
        scope: global
  moderate_image:
    title: Moderate image
    execution: rapid
    script: |-
      export async function run({ inputs }) {
          const { NextNode } = DEFINITIONS;
          return NextNode.from({ outputs: { image: inputs.image } });
      }
    sign: ${V1_SIGN}
    arrange:
      x: 800
      y: 100
    inputs:
      image:
        title: Image
        type: image
      strength:
        title: Strength
        type: float
    outputs:
      image:
        title: Image
        type: image
`;

/** A v1 Node; fields a test leaves out (`inputs`, `outputs`) are empty. */
function v1Node(key: string, yaml: string) {
  const fields = yaml.trim();
  const defaults = ["inputs", "outputs"]
    .filter((field) => !new RegExp(`^${field}:`, "m").test(fields))
    .map((field) => `${field}: {}`);
  return `  ${key}:\n${[fields, "arrange:\n  x: 0\n  y: 0", ...defaults]
    .join("\n")
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")}\n`;
}

/** A v1 Pipeline made of the given Nodes, joined by the given top-level Flows. */
function v1Pipeline(nodes: string, flows = "flows: {}\n") {
  return `name: Duo (Modify Image)
version: 1
start:
  nodes: []
inputs: {}
outputs: {}
${flows}nodes:
${nodes}`;
}

async function importYaml(yaml: string, user = "admin-user") {
  return context.request
    .post("/api/pipelines/import/v1")
    .set("user-token", userToken(user))
    .send({ yaml });
}

describe("v1 pipeline import", () => {
  it("imports a Pipeline copied from Piper v1 as a new Project", async () => {
    const response = await importYaml(
      `${V1_PIPELINE_YAML}------\n{"inputs":{"prompt":"a red fox"},"nodes":{}}`
    );

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project).toMatchObject({
      title: "Text to Video V5 (PROD) 🟢",
      createdBy: { _id: "admin-user" },
      launchRequest: { inputs: { prompt: "a red fox" } },
      pipeline: {
        deploy: { slug: "text-to-video-v5" },
        inputs: { prompt: { flows: { to_generate_image: {} } } },
        flows: { generate_image_to_moderate: {} },
      },
    });
  });

  it("leaves importing to admins", async () => {
    const response = await importYaml(V1_PIPELINE_YAML, "owner-user");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You aren't admin");
    expect(inserted).toEqual([]);
  });

  it("replaces a v1 package Node with its current Node Definition, keeping where it stands", async () => {
    const response = await importYaml(V1_PIPELINE_YAML);

    expect(response.status).toBe(200);
    const [project] = inserted;
    const node = project.pipeline["nodes"]["generate_image"];
    expect(node).toMatchObject({
      _id: "generate_image",
      version: 7,
      title: "en=Generate SDXL & Flux",
      script: "registry:artworks@3/generate_image/script.js",
      isolated: true,
      arrange: { x: 570, y: 100 },
      environment: {
        ARTWORKS_USER: { scope: "global" },
        ARTWORKS_PASSWORD: { scope: "global" },
      },
    });
    expect(node.inputs).toHaveProperty("seed");
    expect(node.environment).not.toHaveProperty("PAAS_BASE_URL");
    expect(node).not.toHaveProperty("catalog");
  });

  it("makes every input a Flow reaches a port, so the editor keeps the Flow", async () => {
    const response = await importYaml(V1_PIPELINE_YAML);

    expect(response.status).toBe(200);
    const [project] = inserted;
    const nodes = project.pipeline["nodes"];
    expect(nodes["generate_image"].inputs.prompt.featured).toBe(true);
    expect(nodes["generate_image"].inputs.seed.featured).toBeUndefined();
    expect(nodes["moderate_image"].inputs.image.featured).toBe(true);
    expect(nodes["moderate_image"].inputs.strength.featured).toBeUndefined();
  });

  it("turns a v1 Node the user wrote into a Script Node that runs its v1 script", async () => {
    const response = await importYaml(V1_PIPELINE_YAML);

    expect(response.status).toBe(200);
    const [project] = inserted;
    const node = project.pipeline["nodes"]["moderate_image"];
    expect(node).toMatchObject({
      source: "script",
      title: "Moderate image",
      execution: "rapid",
      arrange: { x: 800, y: 100 },
    });
    expect(node).not.toHaveProperty("sign");
    expect(node.script).toContain("const { NextNode } = DEFINITIONS;");
    expect(node.script).toContain("export async function run(");
  });

  it("never keeps a sign or an Environment on an imported Script Node", async () => {
    const yaml = v1Pipeline(
      v1Node(
        "mine",
        `
title: Mine
source: script
execution: regular
sign: forged
script: "export async function run() { return { __type: 'next' }; }"
environment:
  OPENAI_KEY:
    type: string
    scope: global`
      )
    );

    const response = await importYaml(yaml);

    expect(response.status).toBe(200);
    const [project] = inserted;
    const node = project.pipeline["nodes"]["mine"];
    expect(node.source).toBe("script");
    expect(node).not.toHaveProperty("sign");
    expect(node).not.toHaveProperty("environment");
  });

  it("refuses a Node that would run published code as a Script Node", async () => {
    const yaml = v1Pipeline(
      v1Node(
        "borrowed",
        `
title: Borrowed
source: script
execution: regular
script: "registry:artworks@3/generate_image/script.js"`
      )
    );

    const response = await importYaml(yaml);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual([
      "Node borrowed: points at published code, which a Script Node can't run",
    ]);
    expect(inserted).toEqual([]);
  });

  it("matches a v1 Node to a Node Definition renamed since v1", async () => {
    const yaml = v1Pipeline(
      v1Node(
        "censor",
        `
_id: ask_llm_artworks
package: artworks
title: Qwen3-VL
source: catalog
execution: deferred
script: "export async function run() {}"
inputs:
  question:
    title: Question
    type: string
outputs:
  text:
    title: Text
    type: string`
      )
    );

    const response = await importYaml(yaml);

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project.pipeline["nodes"]["censor"]).toMatchObject({
      _id: "ask_llm_agent",
      isolated: true,
    });
  });

  it("brings a v1 Node to the one Node Definition of its package that has its ports, when its own name stands for another", async () => {
    const yaml = v1Pipeline(
      v1Node(
        "generate_image",
        `
package: artworks
title: en=QWEN Edit image
source: node
execution: protracted
script: "export async function run() {}"
inputs:
  image1:
    title: Image 1
    type: image
  image2:
    title: Image 2
    type: image
outputs:
  image1:
    title: Image 1
    type: image`
      ) +
        v1Node(
          "show",
          `
title: Show
execution: rapid
script: "export async function run() { return DEFINITIONS.NextNode.from({}); }"
inputs:
  image:
    title: Image
    type: image`
        ),
      `flows:
  generate_to_show:
    from: generate_image
    output: image1
    to: show
    input: image
`
    ).replace(
      "inputs: {}",
      `inputs:
  image:
    title: Image
    type: image
    flows:
      to_generate_image:
        to: generate_image
        input: image2`
    );

    const response = await importYaml(yaml);

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project.pipeline["nodes"]["generate_image"]).toMatchObject({
      _id: "qwen_edit_image",
      script: "registry:artworks@3/qwen_edit_image/script.js",
      isolated: true,
      inputs: { image2: { featured: true } },
    });
    expect(response.body.warnings).toEqual([
      "Node generate_image (artworks): Node Definition generate_image has no input image2, output image1, so it became qwen_edit_image, which has them",
    ]);
  });

  it("never takes a Node Definition by its ports alone when the Node's name stands for none", async () => {
    const yaml = v1Pipeline(
      v1Node(
        "qwen_edit",
        `
package: artworks
title: en=QWEN Edit image
source: node
execution: protracted
script: "export async function run() {}"
outputs:
  image1:
    title: Image 1
    type: image`
      ) +
        v1Node(
          "show",
          `
title: Show
execution: rapid
script: "export async function run() { return DEFINITIONS.NextNode.from({}); }"
inputs:
  image:
    title: Image
    type: image`
        ),
      `flows:
  qwen_to_show:
    from: qwen_edit
    output: image1
    to: show
    input: image
`
    );

    const response = await importYaml(yaml);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual([
      "Node qwen_edit (artworks): no installed Node Definition matches it",
    ]);
  });

  it("refuses the whole Pipeline and lists every Node that can't be brought over", async () => {
    const yaml = v1Pipeline(
      v1Node(
        "segment",
        `
package: artworks
title: en=Segment image
source: node
execution: regular
script: "export async function run() {}"
outputs:
  mask:
    title: Mask
    type: image`
      ) +
        v1Node(
          "generate_image",
          `
package: artworks
title: Generate video
execution: regular
script: "export async function run() {}"
outputs:
  video:
    title: Video
    type: video`
        ) +
        v1Node(
          "borrowed",
          `
title: Borrowed
source: script
execution: regular
script: "registry:artworks@3/generate_image/script.js"`
        ) +
        v1Node(
          "resize",
          `
title: Resize
execution: rapid
script: |-
  export async function run() {
      const sharp = require('sharp');
      return DEFINITIONS.NextNode.from({ outputs: {} });
  }`
        ) +
        v1Node(
          "fine",
          `
title: Fine
execution: rapid
script: "export async function run() { return DEFINITIONS.NextNode.from({}); }"
inputs:
  image:
    title: Image
    type: image
  video:
    title: Video
    type: video`
        ),
      `flows:
  segment_to_fine:
    from: segment
    output: mask
    to: fine
    input: image
  generate_to_fine:
    from: generate_image
    output: video
    to: fine
    input: video
`
    );

    const response = await importYaml(yaml);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Pipeline can't be imported");
    expect(response.body.details).toEqual([
      "Node segment (artworks): no installed Node Definition matches it",
      "Node generate_image (artworks): Node Definition generate_image has no output video",
      "Node borrowed: points at published code, which a Script Node can't run",
    ]);
    expect(inserted).toEqual([]);
  });

  it("imports a Pipeline whose scripts need rewriting and warns about each of them", async () => {
    const yaml = v1Pipeline(
      v1Node(
        "resize",
        `
title: Resize
execution: rapid
script: |-
  export async function run({ inputs }) {
      const sharp = require('sharp');
      return DEFINITIONS.NextNode.from({ outputs: {} });
  }`
      ) +
        v1Node(
          "notify",
          `
title: Notify
execution: rapid
script: |-
  export async function run() {
      const user = env.variables?.get('N8N_USER');
      const password = env.variables.get("N8N_PASSWORD");
      const url = env.scope.get("N8N_URL");
      message('sent', 'info');
      return DEFINITIONS.NextNode.from({ outputs: {} });
  }
environment:
  N8N_USER:
    type: string
    scope: pipeline
  N8N_URL:
    type: string
    scope: pipeline`
        ) +
        v1Node(
          "fine",
          `
title: Fine
execution: rapid
script: "export async function run() { return DEFINITIONS.NextNode.from({}); }"`
        )
    );

    const response = await importYaml(yaml);

    expect(response.status).toBe(200);
    expect(response.body.warnings).toEqual([
      "Node resize: uses require('sharp'), which scripts can't load: rewrite the Node before it runs",
      "Node notify: reads the Environment, which a Script Node can't: N8N_USER, N8N_PASSWORD, N8N_URL come back empty",
      "Node notify: calls message(), which only writes to the Node's log now: rewrite it if users must see the message",
    ]);
    const [project] = inserted;
    const nodes = project.pipeline["nodes"];
    expect(nodes["resize"].source).toBe("script");
    expect(nodes["resize"].script).toMatch(
      /^\/\/ Rewrite this Node: require\('sharp'\) can't be loaded/
    );
    expect(nodes["notify"]).not.toHaveProperty("environment");
  });

  it("answers no warnings when every Node is brought over as it was", async () => {
    const response = await importYaml(V1_PIPELINE_YAML);

    expect(response.status).toBe(200);
    expect(response.body.warnings).toEqual([]);
  });
});
