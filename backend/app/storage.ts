import { format } from "date-fns";
import { fileTypeFromBuffer } from "file-type";
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
  const createdAt = new Date();
  const [y, m, d] = [
    format(createdAt, "yyyy"),
    format(createdAt, "MM"),
    format(createdAt, "dd"),
  ];

  const key = [[y, m, d].join("-"), fileName].join("_");
  return s3.upload(key, data, bucket);
}

export async function artefact(
  data: Buffer,
  fileName: string | null = null
): Promise<string> {
  return upload(
    data,
    fileName ||
      (await (async () => {
        const { ext } = await fileTypeFromBuffer(data);
        return `${sid()}.${ext}`;
      })()),
    ARTEFACTS_BUCKET_NAME
  );
}

export async function output(
  data: Buffer,
  fileName: string | null = null
): Promise<string> {
  return upload(
    data,
    fileName ||
      (await (async () => {
        const { ext } = await fileTypeFromBuffer(data);
        return `${sid()}.${ext}`;
      })()),
    LAUNCHES_BUCKET_NAME
  );
}

export async function asset(
  data: Buffer,
  fileName: string | null = null
): Promise<string> {
  return upload(data, fileName, ASSETS_BUCKET_NAME);
}
