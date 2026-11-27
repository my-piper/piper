import { MONGO_DB, MONGO_URL } from "consts/core";
import { Db, MongoClient } from "mongodb";
import { hasInputOf } from "packages/nodes/accepts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("catalog filter by accepted input type", () => {
  const client = new MongoClient(MONGO_URL);
  let db: Db;

  beforeAll(async () => {
    await client.connect();
    db = client.db(MONGO_DB);
  });

  beforeEach(async () => {
    await db
      .collection("nodes")
      .drop()
      .catch(() => undefined);
    await db.collection<{ _id: string }>("nodes").insertMany([
      { _id: "upscale", inputs: { image: { type: "image" } } },
      {
        _id: "caption",
        inputs: { image: { type: "image[]" }, hint: { type: "string" } },
      },
      { _id: "echo", inputs: { text: { type: "string" } } },
      { _id: "clock", inputs: {} },
      { _id: "legacy" },
    ]);
  });

  afterAll(async () => {
    await db
      .collection("nodes")
      .drop()
      .catch(() => undefined);
    await client.close();
  });

  async function accepting(types: string[]) {
    const nodes = await db
      .collection("nodes")
      .find({ $expr: hasInputOf(types) })
      .sort({ _id: 1 })
      .toArray();
    return nodes.map(({ _id }) => _id);
  }

  it("keeps nodes with an input of any of the types", async () => {
    const images = await accepting(["image", "image[]"]);
    const strings = await accepting(["string"]);

    expect(images).toEqual(["caption", "upscale"]);
    expect(strings).toEqual(["caption", "echo"]);
  });

  it("leaves out nodes without inputs or without a matching one", async () => {
    const audio = await accepting(["audio"]);

    expect(audio).toEqual([]);
  });
});
