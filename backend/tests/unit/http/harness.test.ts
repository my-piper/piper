import { resetHttpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { NETWORK_BLOCKED_MESSAGE } from "../../helpers/network";
import net from "node:net";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(resetHttpDoubles);

describe("HTTP test isolation", () => {
  it("uses the real Express middleware and closes its local test server", async () => {
    const context = await createHttpApp();

    const response = await context.request.get("/api/health").timeout(2000);

    expect(response.status).toBe(200);
    expect(response.text).toContain("I am alive");
    await context.close();

    expect(context.server.listening).toBe(false);
  });

  it("blocks other destinations while allowing the test server", async () => {
    const context = await createHttpApp();

    expect(() =>
      net.connect({ host: "example.com", port: context.port })
    ).toThrow(NETWORK_BLOCKED_MESSAGE);
    expect(() =>
      net.connect({
        host: "127.0.0.1",
        port: context.port === 65535 ? 65534 : context.port + 1,
      })
    ).toThrow(NETWORK_BLOCKED_MESSAGE);
    await expect(fetch("https://example.com")).rejects.toThrow(
      NETWORK_BLOCKED_MESSAGE
    );

    const response = await context.request.get("/api/health").timeout(2000);

    expect(response.status).toBe(200);
  });

  it("does not retain registered routes between applications", async () => {
    const first = await createHttpApp();
    first.app.get("/only-first", (_req, res) => res.send("first"));
    await first.close();

    const second = await createHttpApp();
    const response = await second.request.get("/only-first").timeout(2000);

    expect(response.status).toBe(404);
  });
});
