import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

/** Projects as MongoDB received them; the import reuses the object afterwards. */
let inserted: Record<string, unknown>[];

beforeEach(async () => {
  httpScenario();
  inserted = [];
  httpDoubles.projects.insertOne.mockImplementation(async (project) => {
    inserted.push(structuredClone(project));
    return { acknowledged: true };
  });
  context = await createHttpApp([() => import("api/pipelines")]);
});

const V1_SIGN =
  "1529dfa70150e27dae565160e2e6a6cf626378d86d9176b94dfc333b1ca192f9";

/**
 * A Pipeline as Piper v1 shows it on a Project's YAML page: Node environment
 * declarations still carry a title, Nodes carry the sign v1 issued, and the
 * Deploy has a slug and a scope.
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
      from_generate_image:
        from: generate_image
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
    groups:
      inputs:
        base:
          order: 1
          title: en=Base parameters;ru=Базовые параметры
    inputs:
      prompt:
        order: 1
        title: en=Prompt;ru=Подсказка
        group: base
        type: string
        required: true
        multiline: true
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
    source: catalog
    execution: rapid
    script: "export async function run({ inputs }) { return inputs; }"
    sign: ${V1_SIGN}
    arrange:
      x: 800
      y: 100
    inputs:
      image:
        title: Image
        type: image
    outputs:
      image:
        title: Image
        type: image
`;

describe("pipeline import", () => {
  it("imports a Pipeline copied from Piper v1 as a new Project", async () => {
    const response = await context.request
      .post("/api/pipelines/import")
      .set("user-token", userToken())
      .send({
        yaml: `${V1_PIPELINE_YAML}------\n{"inputs":{"prompt":"a red fox"},"nodes":{}}`,
      });

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project).toMatchObject({
      title: "Text to Video V5 (PROD) 🟢",
      createdBy: { _id: "owner-user" },
      launchRequest: { inputs: { prompt: "a red fox" } },
      pipeline: {
        deploy: { slug: "text-to-video-v5" },
        nodes: {
          generate_image: {
            sign: V1_SIGN,
            environment: {
              PAAS_BASE_URL: { type: "string", scope: "global" },
            },
          },
          moderate_image: { sign: V1_SIGN },
        },
      },
    });
  });

  it.each([
    { name: "a newline", yaml: `${V1_PIPELINE_YAML}------\n` },
    { name: "nothing", yaml: `${V1_PIPELINE_YAML}------` },
    { name: "a blank line", yaml: `${V1_PIPELINE_YAML}------\n\n` },
    { name: "trailing spaces", yaml: `${V1_PIPELINE_YAML}------  \n  ` },
    {
      name: "Windows line endings",
      yaml: `${V1_PIPELINE_YAML}------\n`.replace(/\n/g, "\r\n"),
    },
  ])(
    "imports a v1 Pipeline whose empty Launch request is followed by $name",
    async ({ yaml }) => {
      const response = await context.request
        .post("/api/pipelines/import")
        .set("user-token", userToken())
        .send({ yaml });

      expect(response.status).toBe(200);
      const [project] = inserted;
      expect(project.launchRequest).toEqual({ inputs: {}, nodes: {} });
    }
  );

  it("reads a Launch request pasted after a separator with Windows line endings", async () => {
    const yaml = `${V1_PIPELINE_YAML}------\n{"inputs":{"prompt":"a red fox"},"nodes":{}}\n`;

    const response = await context.request
      .post("/api/pipelines/import")
      .set("user-token", userToken())
      .send({ yaml: yaml.replace(/\n/g, "\r\n") });

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project.launchRequest).toEqual({
      inputs: { prompt: "a red fox" },
      nodes: {},
    });
  });
});
