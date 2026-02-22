import { S3_BASE_URL } from "consts/s3";
import { format } from "date-fns";
import { getFileInfo } from "utils/files";
import { sid } from "utils/string";
import {
  ARTEFACTS_BUCKET_NAME,
  ASSETS_BUCKET_NAME,
  OUTPUTS_BUCKET_NAME,
} from "../consts/storage";
import * as s3 from "./s3";

async function upload(
  data: Buffer,
  fileName: string | null = null,
  bucket: string | null = null
): Promise<string> {
  return s3.upload(fileName, data, bucket);
}

async function getKey(data: Buffer, fileName: string | null = null) {
  return !!fileName
    ? (() => {
        const createdAt = new Date();
        const [y, m, d] = [
          format(createdAt, "yyyy"),
          format(createdAt, "MM"),
          format(createdAt, "dd"),
        ];
        return [[y, m, d].join("-"), fileName].join("_");
      })()
    : await (async () => {
        const { ext } = await getFileInfo(data);
        return `${sid()}.${ext}`;
      })();
}

export async function artefact(
  data: Buffer,
  fileName: string | null = null
): Promise<string> {
  return upload(data, await getKey(data, fileName), ARTEFACTS_BUCKET_NAME);
}

export async function output(
  data: Buffer,
  fileName: string | null = null
): Promise<string> {
  return upload(data, await getKey(data, fileName), OUTPUTS_BUCKET_NAME);
}

export async function asset(
  data: Buffer,
  fileName: string | null = null
): Promise<string> {
  return upload(data, fileName, ASSETS_BUCKET_NAME);
}

export function bucket(url: string): "artefacts" | "outputs" | null {
  if (url.indexOf(S3_BASE_URL) !== 0) {
    return null;
  }
  const path = url.substring(S3_BASE_URL.length + 1);
  const bucket = path.substring(0, path.indexOf("/"));
  switch (bucket) {
    case OUTPUTS_BUCKET_NAME:
      return "outputs";
    case ARTEFACTS_BUCKET_NAME:
      return "artefacts";
    default:
      return null;
  }
}
