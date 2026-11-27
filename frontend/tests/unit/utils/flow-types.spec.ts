import { acceptedInputTypes } from "src/utils/flow-types";

describe("acceptedInputTypes", () => {
  it("lets JSON feed scalar inputs", () => {
    const types = acceptedInputTypes("json");

    expect(types).toEqual(["json", "string", "integer", "float", "boolean"]);
  });

  it("lets a single image and an image list feed each other", () => {
    const single = acceptedInputTypes("image");
    const list = acceptedInputTypes("image[]");

    expect(single).toEqual(["image", "image[]"]);
    expect(list).toEqual(["image", "image[]"]);
  });

  it("matches other types exactly", () => {
    const types = acceptedInputTypes("audio");

    expect(types).toEqual(["audio"]);
  });
});
