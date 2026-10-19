import { toInstance } from "core-kit/packages/transform";
import { Launch } from "models/launch";
import { NodeOutput } from "models/node";
import { NodeOutputs } from "types/node";
import { convertInput, convertOutputs } from "utils/node";
import { describe, expect, it, vi } from "vitest";

const { storage, download } = vi.hoisted(() => ({
  storage: { bucket: vi.fn(), output: vi.fn(), artefact: vi.fn() },
  download: vi.fn(),
}));

vi.mock("app/storage", () => storage);
vi.mock("core-kit/packages/redis", () => ({ default: {} }));
vi.mock("utils/web", () => ({ download }));

const launch = new Launch({ _id: "launch" });

describe("node output conversion", () => {
  it.each([
    { type: "boolean", value: false, expected: false },
    { type: "integer", value: 0, expected: 0 },
    { type: "float", value: 1.25, expected: 1.25 },
    { type: "string", value: "", expected: "" },
    { type: "string[]", value: ["first", "second"], expected: "first|second" },
    { type: "string", value: null, expected: null },
  ])("serializes $type output $value", async ({ type, value, expected }) => {
    const config = new Map([["result", toInstance({ type }, NodeOutput)]]);
    const outputs = new Map([["result", value]]) as NodeOutputs;

    const result = await convertOutputs({ launch, node: "echo", bucket: null })(
      outputs,
      config
    );

    expect(result).toEqual({ result: expected });
    expect(download).not.toHaveBeenCalled();
    expect(storage.output).not.toHaveBeenCalled();
    expect(storage.artefact).not.toHaveBeenCalled();
  });

  it("round trips JSON outputs containing nested and falsy values", async () => {
    const value = { items: [false, 0, "", null], nested: { enabled: false } };
    const outputs = new Map([["result", value]]) as unknown as NodeOutputs;
    const config = new Map([
      ["result", toInstance({ type: "json" }, NodeOutput)],
    ]);

    const result = await convertOutputs({ launch, node: "echo", bucket: null })(
      outputs,
      config
    );

    expect(typeof result.result).toBe("string");
    expect(convertInput(result.result, "json")).toEqual(value);
  });

  it("omits absent outputs and ignores undeclared outputs", async () => {
    const outputs: NodeOutputs = new Map([["unexpected", "ignored"]]);
    const config = new Map([
      ["result", toInstance({ type: "string" }, NodeOutput)],
    ]);

    const result = await convertOutputs({ launch, node: "echo", bucket: null })(
      outputs,
      config
    );

    expect(result).toEqual({});
  });

  it("reuses a media URL already in the selected bucket", async () => {
    storage.bucket.mockReturnValue("outputs");
    const url = "https://example.com/image.png";
    const outputs: NodeOutputs = new Map([["image", url]]);
    const config = new Map([
      ["image", toInstance({ type: "image" }, NodeOutput)],
    ]);

    const result = await convertOutputs({
      launch,
      node: "echo",
      bucket: "outputs",
    })(outputs, config);

    expect(result).toEqual({ image: url });
    expect(download).not.toHaveBeenCalled();
    expect(storage.output).not.toHaveBeenCalled();
  });

  it.each(["outputs", "artefacts", null] as const)(
    "stores a data URI in bucket %s",
    async (bucket) => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
      const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      storage.output.mockResolvedValue("https://example.com/outputs/image.svg");
      storage.artefact.mockResolvedValue(
        "https://example.com/artefacts/image.svg"
      );
      const outputs: NodeOutputs = new Map([["image", uri]]);
      const config = new Map([
        ["image", toInstance({ type: "image" }, NodeOutput)],
      ]);
      const save = bucket === "outputs" ? storage.output : storage.artefact;

      const result = await convertOutputs({ launch, node: "echo", bucket })(
        outputs,
        config
      );

      expect(result.image).toBe(
        `https://example.com/${bucket === "outputs" ? "outputs" : "artefacts"}/image.svg`
      );
      expect(save).toHaveBeenCalledExactlyOnceWith(
        Buffer.from(svg),
        expect.stringMatching(/^launch_echo_image_.+\.svg$/)
      );
      expect(download).not.toHaveBeenCalled();
    }
  );

  it("downloads media from another bucket before saving it", async () => {
    const data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    storage.bucket.mockReturnValue("artefacts");
    storage.output.mockResolvedValue("https://example.com/outputs/image.svg");
    download.mockResolvedValue({ data, mimeType: "image/svg+xml" });
    const outputs: NodeOutputs = new Map([
      ["image", "https://example.com/source.svg"],
    ]);
    const config = new Map([
      ["image", toInstance({ type: "image" }, NodeOutput)],
    ]);

    const result = await convertOutputs({
      launch,
      node: "echo",
      bucket: "outputs",
    })(outputs, config);

    expect(result).toEqual({ image: "https://example.com/outputs/image.svg" });
    expect(download).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/source.svg"
    );
    expect(storage.output).toHaveBeenCalledExactlyOnceWith(
      data,
      expect.any(String)
    );
  });

  it("serializes image arrays in their original order", async () => {
    storage.bucket.mockReturnValue("outputs");
    const outputs: NodeOutputs = new Map([
      [
        "images",
        ["https://example.com/first.png", "https://example.com/second.png"],
      ],
    ]);
    const config = new Map([
      ["images", toInstance({ type: "image[]" }, NodeOutput)],
    ]);

    const result = await convertOutputs({
      launch,
      node: "echo",
      bucket: "outputs",
    })(outputs, config);

    expect(result).toEqual({
      images: "https://example.com/first.png|https://example.com/second.png",
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects non-string media outputs", async () => {
    const outputs: NodeOutputs = new Map([["image", false]]);
    const config = new Map([
      ["image", toInstance({ type: "image" }, NodeOutput)],
    ]);

    await expect(
      convertOutputs({ launch, node: "echo", bucket: null })(outputs, config)
    ).rejects.toThrow("Can't convert binary");
  });
});
