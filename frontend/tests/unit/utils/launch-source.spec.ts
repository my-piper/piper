import { RunScope } from "src/models/run-scope";
import { launchSource } from "src/utils/launch-source";

describe("launchSource", () => {
  it("reads a Launch with a parent as a Child Launch", () => {
    const launch = { parent: "launch_parent", comment: "Child of launch X" };

    const source = launchSource(launch);

    expect(source).toBe("child");
  });

  it("reads a Deploy call by its run scope, whatever its comment", () => {
    const launch = {
      scope: new RunScope({ id: "scope_a" }),
      comment: "Nightly import",
    };

    const source = launchSource(launch);

    expect(source).toBe("api");
  });

  it("reads a Deploy call without a scope by its default comment", () => {
    const launch = { comment: "API call from 10.0.0.1" };

    const source = launchSource(launch);

    expect(source).toBe("api");
  });

  it("reads everything else as started from the canvas", () => {
    const launch = { comment: "UI call" };

    const source = launchSource(launch);

    expect(source).toBe("ui");
  });
});
