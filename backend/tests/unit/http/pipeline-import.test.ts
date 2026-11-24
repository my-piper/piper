import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { toInstance } from "core-kit/packages/transform";
import { Node } from "models/node";
import { generateSign } from "packages/nodes/sign-node";
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

/** The sign this Piper issues for a Node running SCRIPT with no Environment. */
const ISSUED_SIGN = generateSign(toInstance({ script: SCRIPT }, Node));

/** A Pipeline as this Piper exports it: a signed Node and a Script Node. */
function pipelineYaml({ sign = ISSUED_SIGN, scriptNode = SCRIPT } = {}) {
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
    sign: ${sign}
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
      visibility: "private",
      createdBy: { _id: "admin-user" },
      launchRequest: { inputs: { prompt: "a red fox" } },
      pipeline: {
        inputs: { prompt: { flows: { to_generate_image: {} } } },
        nodes: {
          generate_image: {
            sign: ISSUED_SIGN,
            inputs: { prompt: { featured: true } },
          },
        },
      },
    });
  });

  it("re-signs a Node whose sign this Piper didn't issue", async () => {
    const response = await importYaml(pipelineYaml({ sign: "forged" }));

    expect(response.status).toBe(200);
    const [project] = inserted;
    expect(project.pipeline["nodes"]["generate_image"].sign).toBe(ISSUED_SIGN);
  });

  it("never keeps a sign or an Environment on a Script Node", async () => {
    const response = await importYaml(pipelineYaml());

    expect(response.status).toBe(200);
    const [project] = inserted;
    const node = project.pipeline["nodes"]["mine"];
    expect(node).not.toHaveProperty("sign");
    expect(node).not.toHaveProperty("environment");
  });

  it("refuses a Script Node that points at published code", async () => {
    const response = await importYaml(
      pipelineYaml({ scriptNode: "registry:artworks@3/x/script.js" })
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Script Node mine must hold its own code"
    );
    expect(inserted).toEqual([]);
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
