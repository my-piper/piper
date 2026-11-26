import { PiperIconPipe } from "src/pipes/piper-icon";

describe("piperIcon pipe", () => {
  const pipe = new PiperIconPipe();

  it("keeps a name from the Piper icon set", () => {
    expect(pipe.transform("text_generation")).toBe("text_generation");
  });

  it("drops names Taiga would load as a URL or resolve elsewhere", () => {
    const names = [
      "https://tracker.example/pixel.svg",
      "//tracker.example/pixel.svg",
      "../assets/logo.svg",
      "@tui.house",
      "@img.https://tracker.example",
      "constructor",
      "no-such-icon",
      "",
      null,
      undefined,
    ];

    expect(names.map((name) => pipe.transform(name))).toEqual(
      names.map((): null => null),
    );
  });
});
