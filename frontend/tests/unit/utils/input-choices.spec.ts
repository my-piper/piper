import { choiceGroups } from "src/utils/input-choices";

describe("choiceGroups", () => {
  it("shows NSFW options as an ordinary group", () => {
    const options = [
      "sd.safetensors|Stable Diffusion",
      "albedo.safetensors|AlbedoBase XL <SDXL>",
      "explicit.safetensors|Explicit <NSFW>",
    ];

    const groups = choiceGroups(options, (label) => label);

    expect(groups).toEqual([
      {
        name: null,
        choices: [{ value: "sd.safetensors", label: "Stable Diffusion" }],
      },
      {
        name: "SDXL",
        choices: [{ value: "albedo.safetensors", label: "AlbedoBase XL" }],
      },
      {
        name: "NSFW",
        choices: [{ value: "explicit.safetensors", label: "Explicit" }],
      },
    ]);
  });
});
