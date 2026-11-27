import { DeployNode } from "src/models/deploy-node";
import { Node } from "src/models/node";
import {
  deployItem,
  matchDeploys,
  nodeFromDeploy,
  parseDeployRef,
} from "src/utils/deploy-node";
import { toInstance } from "src/utils/models";

function deploy(changes: object = {}): DeployNode {
  return toInstance(
    {
      prefix: "owner",
      slug: "summarizer",
      title: "Summarizer",
      inputs: { text: { title: "Text", type: "string" } },
      outputs: { summary: { title: "Summary", type: "string" } },
      ...changes,
    },
    DeployNode,
  );
}

describe("parseDeployRef", () => {
  for (const { text, ref } of [
    { text: "owner/summarizer", ref: { prefix: "owner", slug: "summarizer" } },
    {
      text: "https://piper.example/api/owner/summarizer/launch",
      ref: { prefix: "owner", slug: "summarizer" },
    },
    {
      text: " https://piper.example/api/summarizer ",
      ref: { slug: "summarizer" },
    },
  ]) {
    it(`reads ${text}`, () => {
      const parsed = parseDeployRef(text);

      expect({ ...parsed }).toEqual(ref);
    });
  }

  for (const text of [
    "summarizer",
    "a/b",
    "owner/summarizer/extra",
    "",
    null,
  ]) {
    it(`treats ${JSON.stringify(text)} as a search`, () => {
      const parsed = parseDeployRef(text);

      expect(parsed).toBeNull();
    });
  }
});

describe("nodeFromDeploy", () => {
  it("makes a deploy node whose every input is a port", () => {
    const node = nodeFromDeploy(deploy({ slug: "sum-up-text" }));

    expect(node).toBeInstanceOf(Node);
    expect(node).toMatchObject({
      _id: "deploy_sum_up_text",
      title: "Summarizer",
      source: "deploy",
      deploy: { prefix: "owner", slug: "sum-up-text" },
    });
    expect(node.inputs.get("text")).toMatchObject({
      type: "string",
      featured: true,
    });
    expect([...node.outputs.keys()]).toEqual(["summary"]);
  });
});

describe("matchDeploys", () => {
  const listed = [
    deployItem({ prefix: "owner", slug: "summarizer" }, "Summarizer"),
    deployItem({ prefix: "owner", slug: "translator" }, "Translate"),
  ];

  for (const { query, titles } of [
    { query: "", titles: ["Summarizer", "Translate"] },
    { query: "summ", titles: ["Summarizer"] },
    { query: "translator", titles: ["Translate"] },
    { query: "owner/summarizer", titles: ["Summarizer"] },
    { query: "other/summarizer", titles: ["other/summarizer"] },
  ]) {
    it(`matches ${JSON.stringify(query)}`, () => {
      const matched = matchDeploys(listed, query);

      expect(matched.map(({ title }) => title)).toEqual(titles);
    });
  }
});
