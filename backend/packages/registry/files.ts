import { exists, load, putPrivate } from "app/s3";
import { REGISTRY_BUCKET_NAME } from "consts/registry";
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
