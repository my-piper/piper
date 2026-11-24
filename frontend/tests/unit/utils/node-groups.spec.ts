import { Node } from "src/models/node";
import { groupNodes } from "src/utils/node-groups";
import { toInstance } from "src/utils/models";

function node(plain: object) {
  return toInstance(plain, Node);
}

describe("groupNodes", () => {
  it("groups nodes by their Node Package, titled by the package", () => {
    const nodes = [
      node({
        _id: "score",
        title: "Score",
        package: "artworks",
        packageTitle: "ArtWorks",
        order: 2,
      }),
      node({
        _id: "translate",
        title: "Translate",
        package: "artworks",
        packageTitle: "ArtWorks",
        order: 1,
      }),
    ];

    const groups = groupNodes(nodes);

    expect(groups.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "artworks", title: "ArtWorks" },
    ]);
    expect(groups[0].nodes.map(({ _id }) => _id)).toEqual([
      "translate",
      "score",
    ]);
  });

  it("puts the Script Node's category before Node Packages, then packages by title", () => {
    const nodes = [
      node({
        _id: "fal_image",
        title: "Image",
        package: "fal",
        packageTitle: "Fal",
      }),
      node({
        _id: "score",
        title: "Score",
        package: "artworks",
        packageTitle: "ArtWorks",
      }),
      node({
        _id: "script",
        title: "Script",
        category: { _id: "builtin", title: "en=Built-in", order: -1 },
      }),
    ];

    const groups = groupNodes(nodes);

    expect(groups.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "builtin", title: "en=Built-in" },
      { id: "artworks", title: "ArtWorks" },
      { id: "fal", title: "Fal" },
    ]);
  });

  it("titles a group by the package id when the package title is unknown", () => {
    const nodes = [
      node({ _id: "lone", title: "Lone", package: "removed_package" }),
    ];

    const groups = groupNodes(nodes);

    expect(groups.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "removed_package", title: "removed_package" },
    ]);
  });
});
