import { MONGO_DB, MONGO_URL } from "consts/core";
import { Db, MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = join(__dirname, "../../../migrations/mongo");

function migration(direction: "up" | "down"): object[] {
  const file = join(
    MIGRATIONS,
    `000009_add_users_identities_index.${direction}.json`
  );
  return JSON.parse(readFileSync(file, "utf8"));
}

async function apply(db: Db, direction: "up" | "down") {
  for (const command of migration(direction)) {
    await db.command(command);
  }
}

function identity(provider: string, subject: string) {
  return {
    provider,
    subject,
    email: `${subject}@example.com`,
    linkedAt: new Date(),
  };
}

describe("users identities index migration", () => {
  const client = new MongoClient(MONGO_URL);
  let db: Db;

  beforeAll(async () => {
    await client.connect();
    db = client.db(MONGO_DB);
  });

  beforeEach(async () => {
    await db
      .collection("users")
      .drop()
      .catch(() => undefined);
    await db.createCollection("users");
    await apply(db, "up");
  });

  afterAll(async () => {
    await db
      .collection("users")
      .drop()
      .catch(() => undefined);
    await client.close();
  });

  it("rejects a second user with the same provider and subject", async () => {
    const users = db.collection<{ _id: string }>("users");
    await users.insertOne({
      _id: "jane",
      identities: [identity("oidc", "s1")],
    } as never);

    const insert = users.insertOne({
      _id: "john",
      identities: [identity("oidc", "s1")],
    } as never);

    await expect(insert).rejects.toMatchObject({ code: 11000 });
  });

  it("allows many users without identities", async () => {
    const users = db.collection<{ _id: string }>("users");

    await users.insertMany([{ _id: "jane" }, { _id: "john" }] as never);

    expect(await users.countDocuments()).toBe(2);
  });

  it("pairs provider and subject within one identity, not across identities", async () => {
    const users = db.collection<{ _id: string }>("users");
    await users.insertOne({
      _id: "jane",
      identities: [identity("oidc", "s1"), identity("other", "s2")],
    } as never);

    await users.insertOne({
      _id: "john",
      identities: [identity("other", "s1")],
    } as never);

    expect(await users.countDocuments()).toBe(2);
  });

  it("drops the index on down", async () => {
    await apply(db, "down");

    const names = (await db.collection("users").indexes()).map((i) => i.name);

    expect(names).not.toContain("identities_provider_subject");
  });
});
