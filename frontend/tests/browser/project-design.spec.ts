import { PROJECT_A_ID } from "../fixtures/plain";
import { expect, test } from "./support/test";

test("autosaves the pipeline's name and tags from the Design tab", async ({
  page,
  api,
  open,
}) => {
  await open(`/en/projects/${PROJECT_A_ID}/design`);
  const name = page.getByLabel("Name");
  const tags = page.getByLabel("Tags");
  await expect(name).toHaveValue("Small graph");

  await name.fill("Renamed graph");
  await tags.fill("beta");
  await tags.press("Enter");

  await expect
    .poll(() => api.projects.get(PROJECT_A_ID)["pipeline"])
    .toMatchObject({ name: "Renamed graph", tags: ["fixture", "beta"] });
  expect(api.projects.get(PROJECT_A_ID)["title"]).toBe("Renamed graph");
});
