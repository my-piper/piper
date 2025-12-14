import { format } from "date-fns";
import { getFileInfo } from "utils/files";
import { sid } from "utils/string";
import {
  ARTEFACTS_BUCKET_NAME,
  ASSETS_BUCKET_NAME,
  LAUNCHES_BUCKET_NAME,
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
  return upload(data, await getKey(data, fileName), LAUNCHES_BUCKET_NAME);
}

export async function asset(
  data: Buffer,
  fileName: string | null = null
): Promise<string> {
  return upload(data, fileName, ASSETS_BUCKET_NAME);
}
