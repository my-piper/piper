import { TMP_PATH } from "consts/core";
import { fileTypeFromBuffer } from "file-type";
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

export async function getFileInfo(data: Buffer): Promise<{
  ext: string;
  mime: string;
}> {
  const result = await fileTypeFromBuffer(new Uint8Array(data));
  if (!result) {
    // try svg
    const text = data
      .toString("utf8", 0, 2048)
      .replace(/^\uFEFF/, "") // strip BOM
      .trim()
      .toLowerCase();
    const isXML =
      text.startsWith("<?xml") ||
      text.startsWith("<svg") ||
      text.startsWith("<!doctype svg");
    if (isXML) {
      if (/<svg[\s>]/.test(text)) {
        return { ext: "svg", mime: "image/svg+xml" };
      }

      return { ext: "xml", mime: "xml" };
    }

    throw new Error("Can't detect file type");
  }
  const { ext, mime } = result;
  return { ext, mime };
}
