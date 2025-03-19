import { MODULES_PATH } from "consts/core";
import { toPlain } from "core-kit/utils/models";
import { writeFile } from "fs/promises";
import path from "path";
import { list } from "./get-installed";

export async function update() {
  const packageJson = await list();
  const json = JSON.stringify(toPlain(packageJson), null, 2);
  await writeFile(path.join(MODULES_PATH, "package.json"), json);
}
