import { TMP_PATH } from "consts/core";
import fs from "fs/promises";
import path from "path";
import { sid } from "./string";

export async function withTempContext(action: (tmpFolder: string) => void) {
  const tmpFolder = path.join(TMP_PATH, sid());
  try {
    await fs.mkdir(tmpFolder, { recursive: true });
    await action(tmpFolder);
  } catch (e) {
    throw e;
  } finally {
    await fs.rm(tmpFolder, { recursive: true });
  }
}
