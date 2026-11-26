import { afterEach, describe, expect, it, vi } from "vitest";

// The released module itself, as Deno loads it from the registry.
const core = await import("../../../builtin-packages/core/1/node.js");

type Call = [URL, RequestInit & { headers: Headers }];

function stubFetch(response: Response) {
  // A fresh copy per call: a body can be read only once.
  const fetch = vi.fn().mockImplementation(async () => response.clone());
  vi.stubGlobal("fetch", fetch);
  return () => fetch.mock.calls[0] as Call;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("core@1 download", () => {
  it("answers v1's { mimeType, data } with the bytes as a Buffer", async () => {
    const lastCall = stubFetch(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      })
    );

    const { mimeType, data } = await core.download("https://images.test/a.png");

    expect(mimeType).toBe("image/png");
    expect(Buffer.isBuffer(data)).toBe(true);
    expect([...data]).toEqual([1, 2, 3]);
    const [url, init] = lastCall();
    expect(String(url)).toBe("https://images.test/a.png");
    expect(init.method).toBe("GET");
    expect(init.headers.get("cache-control")).toBe("no-cache");
    expect(init.headers.get("pragma")).toBe("no-cache");
    expect(init.headers.get("user-agent")).toMatch(/^Mozilla\/5\.0 .*Chrome/);
  });

  it("throws v1's axios-shaped error for a failed download", async () => {
    stubFetch(new Response("gone", { status: 404 }));

    const failure = core.download("https://images.test/a.png");

    await expect(failure).rejects.toMatchObject({
      message: "Request failed with status code 404",
      response: { status: 404 },
    });
  });
});

describe("core@1 httpClient", () => {
  it("sends an object as JSON with Basic auth and query params", async () => {
    const lastCall = stubFetch(Response.json({ ok: true }));

    const response = await core.httpClient({
      method: "post",
      url: "https://api.test/score",
      params: { model: "v5" },
      auth: { username: "user", password: "secret" },
      data: { labels: ["a"] },
    });

    expect(response).toMatchObject({ status: 200, data: { ok: true } });
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    const [url, init] = lastCall();
    expect(String(url)).toBe("https://api.test/score?model=v5");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"labels":["a"]}');
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(init.headers.get("authorization")).toBe(
      `Basic ${btoa("user:secret")}`
    );
  });

  it("keeps a non-JSON answer as text and passes FormData through", async () => {
    const lastCall = stubFetch(new Response("plain"));
    const form = new FormData();

    const { data } = await core.httpClient({
      method: "post",
      url: "https://api.test/upload",
      data: form,
    });

    expect(data).toBe("plain");
    expect(lastCall()[1].body).toBe(form);
  });

  it("gives up after its timeout", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: URL, { signal }: RequestInit) =>
        new Promise((_resolve, reject) =>
          signal?.addEventListener("abort", () => reject(signal.reason))
        )
    );

    const call = core.httpClient({ url: "https://api.test/slow", timeout: 5 });

    await expect(call).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("core@1 httpClient, as v1's axios instance", () => {
  it("offers axios' method shortcuts", async () => {
    const lastCall = stubFetch(Response.json({ id: "task" }));

    const { data } = await core.httpClient.post(
      "https://api.test/tasks",
      { prompt: "x" },
      { headers: { "x-key": "k" } }
    );

    expect(data).toEqual({ id: "task" });
    const [url, init] = lastCall();
    expect(String(url)).toBe("https://api.test/tasks");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"prompt":"x"}');
    expect(init.headers.get("x-key")).toBe("k");
  });

  it("leaves out undefined params and headers and repeats array params", async () => {
    const lastCall = stubFetch(Response.json({}));

    await core.httpClient.get("https://api.test/search", {
      params: { q: undefined, tag: ["a", "b"], page: 2 },
      headers: { "x-optional": undefined },
    });

    const [url, init] = lastCall();
    expect(String(url)).toBe(
      "https://api.test/search?tag%5B%5D=a&tag%5B%5D=b&page=2"
    );
    expect(init.headers.has("x-optional")).toBe(false);
  });

  it("sends no body with GET, and URLSearchParams and bytes as they are", async () => {
    const lastCall = stubFetch(Response.json({}));
    const form = new URLSearchParams({ a: "1" });
    const bytes = new ArrayBuffer(2);

    await core.httpClient({ url: "https://api.test/a", data: { x: 1 } });
    const get = lastCall();
    await core.httpClient.post("https://api.test/b", form);
    await core.httpClient.post("https://api.test/c", bytes);

    expect(get[1].body).toBeUndefined();
    const calls = vi.mocked(fetch).mock.calls as Call[];
    expect(calls[1][1].body).toBe(form);
    expect(calls[2][1].body).toBe(bytes);
    expect(calls[2][1].headers.has("content-type")).toBe(false);
  });

  it("answers any status that validateStatus accepts", async () => {
    stubFetch(Response.json({ error: "busy" }, { status: 503 }));

    const response = await core.httpClient({
      url: "https://api.test/a",
      validateStatus: () => true,
    });

    expect(response).toMatchObject({ status: 503, data: { error: "busy" } });
  });

  it("keeps a JSON answer as text for responseType text", async () => {
    stubFetch(Response.json({ a: 1 }));

    const { data } = await core.httpClient({
      url: "https://api.test/a",
      responseType: "text",
    });

    expect(data).toBe('{"a":1}');
  });
});

describe("core@1 results", () => {
  it("builds next and repeat instructions", () => {
    const done = core.next({ outputs: { x: 1 } });
    const again = core.repeat({ state: { attempt: 2 }, delay: 3000 });

    expect(done).toEqual({ __type: "next", outputs: { x: 1 } });
    expect(again).toEqual({
      __type: "repeat",
      state: { attempt: 2 },
      delay: 3000,
    });
  });

  it.each([
    ["data", "DATA_ERROR"],
    ["fatal", "FATAL_ERROR"],
    ["timeout", "TIMEOUT_ERROR"],
  ] as const)("throwError.%s throws an error with code %s", (kind, code) => {
    const thrown = () => core.throwError[kind]("broken");

    expect(thrown).toThrow(
      expect.objectContaining({ code, message: "broken" })
    );
  });

  it("asks for each new child once and reads a finished child's outputs", async () => {
    const children = {
      nested_1: { status: "finished", outputs: { url: "u" } },
    };
    const { nested, launches } = core.createNested(children);

    const first = await nested.run("child-a", { inputs: { x: 1 } });
    const second = await nested.run("child-b");
    const state = await nested.state(first._id);

    expect(launches).toEqual([
      { key: "nested_2", deploy: { slug: "child-b" }, inputs: {} },
    ]);
    expect(second._id).toBe("nested_2");
    expect(state.outputs.get("url")).toBe("u");
  });
});
