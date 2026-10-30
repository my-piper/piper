import {
  buildFolders,
  findFolder,
  matchFolder,
  removeFromFolders,
} from "src/app/projects/folders";
import { Project } from "src/models/project";

describe("project folders tree", () => {
  it("nests groups by path and totals counts per branch", () => {
    const counts = [
      { group: "Marketing", count: 1 },
      { group: "Marketing/Video", count: 2 },
      { group: "Sales / EU", count: 3 },
    ];

    const roots = buildFolders(counts);

    expect(roots.map((f) => [f.name, f.total, f.count])).toEqual([
      ["Marketing", 3, 1],
      ["Sales", 3, 0],
    ]);
    expect(roots[0].children.map((f) => [f.path, f.group])).toEqual([
      ["Marketing/Video", "Marketing/Video"],
    ]);
    expect(roots[1].group).toBeUndefined();
    expect(roots[1].more).toBeFalse();
    expect(roots[1].children[0].group).toBe("Sales / EU");
  });

  it("finds a folder by its stored group with the way up", () => {
    const roots = buildFolders([{ group: "A/B/C", count: 1 }]);

    const folder = findFolder(roots, "A/B/C");

    expect(folder.path).toBe("A/B/C");
    expect(folder.parent.parent.name).toBe("A");
    expect(findFolder(roots, "A/B")).toBeUndefined();
  });

  it("keeps ancestors of a matching folder", () => {
    const [root] = buildFolders([{ group: "Marketing/Video", count: 1 }]);

    const matches = [matchFolder(root, "video"), matchFolder(root, "sales")];

    expect(matches).toEqual([true, false]);
  });

  it("drops a removed project and the folders it left empty", () => {
    const roots = buildFolders([
      { group: "A", count: 1 },
      { group: "A/B", count: 1 },
    ]);
    const leaf = roots[0].children[0];
    leaf.projects = [new Project({ _id: "p1" })];

    const left = removeFromFolders(roots, "p1");

    expect(left.length).toBe(1);
    expect(left[0].children).toEqual([]);
    expect(left[0].total).toBe(1);
  });
});
