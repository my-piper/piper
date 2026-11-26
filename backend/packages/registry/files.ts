import { exists, load, putPrivate } from "app/s3";
import {
  BUILTIN_PACKAGES,
  BUILTIN_PACKAGES_PATH,
  REGISTRY_BUCKET_NAME,
} from "consts/registry";
import { readFile } from "node:fs/promises";
import { join, posix, resolve, sep } from "node:path";
import { contentType } from "./content-type";

function fileKey(nodePackage: string, version: number, path: string) {
  return [nodePackage, version, path].join("/");
}

export async function putFile(
  nodePackage: string,
  version: number,
  path: string,
  data: Buffer
): Promise<void> {
  await putPrivate(
    fileKey(nodePackage, version, path),
    data,
    REGISTRY_BUCKET_NAME,
    contentType(path)
  );
}

export async function getFile(
  nodePackage: string,
  version: number,
  path: string
): Promise<Buffer | null> {
  if (BUILTIN_PACKAGES.has(nodePackage)) {
    return builtinFile(nodePackage, version, path);
  }
  try {
    return await load(
      fileKey(nodePackage, version, path),
      REGISTRY_BUCKET_NAME
    );
  } catch (e) {
    if ((e as Error).message === "File not found") {
      return null;
    }
    throw e;
  }
}

export async function hasFile(
  nodePackage: string,
  version: number,
  path: string
): Promise<boolean> {
  return exists(fileKey(nodePackage, version, path), REGISTRY_BUCKET_NAME);
}

// A file of a built-in package version, or null when it has none or the path
// isn't a plain path inside that version, as the server requires. Checked
// here too: other callers pass paths as well.
async function builtinFile(
  nodePackage: string,
  version: number,
  path: string
): Promise<Buffer | null> {
  const base = join(BUILTIN_PACKAGES_PATH, nodePackage, String(version));
  const target = resolve(base, path);
  if (
    path.includes("\0") ||
    posix.normalize(path) !== path ||
    path.startsWith("/") ||
    path.split("/").includes("..") ||
    !target.startsWith(base + sep)
  ) {
    return null;
  }
  try {
    return await readFile(target);
  } catch (e) {
    if (
      ["ENOENT", "EISDIR", "ENOTDIR"].includes(
        (e as NodeJS.ErrnoException).code ?? ""
      )
    ) {
      return null;
    }
    throw e;
  }
}
