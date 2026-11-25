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

const SCRIPT = "export async function run({ inputs }) { return inputs; }";

/**
 * A Pipeline as an older Piper exported it: a Package Node and a Script Node,
 * both still carrying the sign Nodes no longer have.
 */
function pipelineYaml({ scriptNode = SCRIPT } = {}) {
  return `name: Text to Video V5
version: 1
start:
  nodes:
    - generate_image
inputs:
  prompt:
    title: Prompt
    type: string
    flows:
      to_generate_image:
        to: generate_image
        input: prompt
    arrange:
      x: 10
      y: 10
outputs: {}
flows: {}
nodes:
  generate_image:
    title: Generate image
    package: artworks
    source: node
    execution: regular
    script: "${SCRIPT}"
    sign: issued
    isolated: true
    arrange:
      x: 570
      y: 100
    inputs:
      prompt:
        title: Prompt
        type: string
        featured: true
    outputs: {}
  mine:
    title: Mine
    source: script
    execution: regular
    script: "${scriptNode}"
    sign: forged
    arrange:
      x: 800
      y: 100
    inputs: {}
    outputs: {}
    environment:
      OPENAI_KEY:
        type: string
        scope: global
`;
}

async function importYaml(yaml: string, user = "admin-user") {
  return context.request
    .post("/api/pipelines/import")
    .set("user-token", userToken(user))
    .send({ yaml });
}

describe("pipeline import", () => {
  it("imports a Pipeline as a new private Project of the admin", async () => {
    const response = await importYaml(
      `${pipelineYaml()}------\n{"inputs":{"prompt":"a red fox"},"nodes":{}}`
    );

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project).toMatchObject({
      title: "Text to Video V5",
      createdBy: { _id: "admin-user" },
      launchRequest: { inputs: { prompt: "a red fox" } },
      pipeline: {
        inputs: { prompt: { flows: { to_generate_image: {} } } },
        nodes: {
          generate_image: {
            isolated: true,
            inputs: { prompt: { featured: true } },
          },
        },
      },
    });
  });

  it("drops the sign an older export carried on its Nodes", async () => {
    const response = await importYaml(pipelineYaml());

    expect(response.status).toBe(200);
    const [project] = inserted;
    const nodes = project.pipeline["nodes"];
    expect(nodes["generate_image"]).not.toHaveProperty("sign");
    expect(nodes["mine"]).not.toHaveProperty("sign");
  });

  it("keeps a Script Node's Environment and published script", async () => {
    const script = "registry:artworks@3/x/script.js";

    const response = await importYaml(pipelineYaml({ scriptNode: script }));

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project.pipeline["nodes"]["mine"]).toMatchObject({
      script,
      environment: { OPENAI_KEY: { type: "string", scope: "global" } },
    });
  });

  it("leaves importing to admins", async () => {
    const response = await importYaml(pipelineYaml(), "owner-user");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You aren't admin");
    expect(inserted).toEqual([]);
  });

  it.each([
    {
      name: "broken YAML",
      yaml: "name: [unclosed",
      message: "Pipeline YAML is invalid",
    },
    {
      name: "a broken Launch request",
      yaml: `${pipelineYaml()}------\n{"inputs":`,
      message: "Launch request JSON is invalid",
    },
  ])("reports $name as a data error", async ({ yaml, message }) => {
    const response = await importYaml(yaml);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(inserted).toEqual([]);
  });

  it("keeps what a URL answered out of the error", async () => {
    httpDoubles.axios.mockResolvedValue({ data: "secret: [internal" });

    const response = await importYaml("http://10.0.0.5/admin");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: "Pipeline YAML is invalid",
      details: [],
    });
  });

  it("doesn't tell why a URL couldn't be loaded", async () => {
    httpDoubles.axios.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:6379")
    );

    const response = await importYaml("http://10.0.0.5:6379/");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Pipeline can't be loaded from the URL");
    expect(JSON.stringify(response.body)).not.toContain("ECONNREFUSED");
  });

  it.each([
    { name: "a newline", yaml: `${pipelineYaml()}------\n` },
    { name: "nothing", yaml: `${pipelineYaml()}------` },
    { name: "a blank line", yaml: `${pipelineYaml()}------\n\n` },
    { name: "trailing spaces", yaml: `${pipelineYaml()}------  \n  ` },
    {
      name: "Windows line endings",
      yaml: `${pipelineYaml()}------\n`.replace(/\n/g, "\r\n"),
    },
  ])(
    "imports a Pipeline whose empty Launch request is followed by $name",
    async ({ yaml }) => {
      const response = await importYaml(yaml);

      expect(response.status).toBe(200);
      const [project] = inserted;
      expect(project.launchRequest).toEqual({ inputs: {}, nodes: {} });
    }
  );

  it("reads a Launch request pasted after a separator with Windows line endings", async () => {
    const yaml = `${pipelineYaml()}------\n{"inputs":{"prompt":"a red fox"},"nodes":{}}\n`;

    const response = await importYaml(yaml.replace(/\n/g, "\r\n"));

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project.launchRequest).toEqual({
      inputs: { prompt: "a red fox" },
      nodes: {},
    });
  });
});
