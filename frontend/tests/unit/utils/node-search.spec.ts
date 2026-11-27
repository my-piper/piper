import { Languages } from "src/enums/languages";
import { Node } from "src/models/node";
import { toInstance } from "src/utils/models";
import { rankNodes, recentNodes, rememberNode } from "src/utils/node-search";

function node(_id: string, title: string, extra: object = {}): Node {
  return toInstance({ _id, title, ...extra }, Node);
}

describe("rankNodes", () => {
  const catalog = [
    node("upscale_image", "Upscale image"),
    node("image", "Image"),
    node("caption", "Caption an image"),
    node("bigimage", "Bigimage tool"),
    node("echo", "Echo", { packageTitle: "Image kit" }),
    node("other", "Other"),
  ];

  it("puts exact, prefix, word, substring and package matches in order", () => {
    const ranked = rankNodes(catalog, "image", Languages.en);

    expect(ranked.map(({ _id }) => _id)).toEqual([
      "image",
      "caption",
      "upscale_image",
      "bigimage",
      "echo",
    ]);
  });

  it("matches the localized title and lists nothing for a blank query", () => {
    const localized = rankNodes(
      [node("de", "en=Translate;de=Übersetzen")],
      "übers",
      Languages.de,
    );
    const blank = rankNodes(catalog, "  ", Languages.en);

    expect(localized.map(({ _id }) => _id)).toEqual(["de"]);
    expect(blank).toEqual([]);
  });
});

describe("recent nodes", () => {
  beforeEach(() => localStorage.removeItem("piper.recent-nodes"));

  it("keeps the last five distinct nodes, newest first", () => {
    for (const id of ["a", "b", "c", "a", "d", "e", "f"]) {
      rememberNode(id);
    }

    const recent = recentNodes();

    expect(recent).toEqual(["f", "e", "d", "a", "c"]);
  });

  it("ignores a broken stored value", () => {
    localStorage.setItem("piper.recent-nodes", "{not json");

    const recent = recentNodes();

    expect(recent).toEqual([]);
  });
});
