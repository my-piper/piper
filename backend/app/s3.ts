import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createLogger } from "core-kit/packages/logger";
import sentry from "core-kit/packages/sentry";
import { DataError } from "core-kit/types/errors";
import { fileTypeFromBuffer } from "file-type";
import trimStart from "lodash/trimStart";
import {
  S3_ACCESS_KEY_ID,
  S3_BASE_URL,
  S3_DEFAULT_BUCKET_NAME,
  S3_DEFAULT_REGION,
  S3_ENDPOINT_URL,
  S3_SECRET_ACCESS_KEY,
} from "../consts/s3";

const logger = createLogger("s3");

const s3 = new S3Client({
  region: S3_DEFAULT_REGION,
  endpoint: S3_ENDPOINT_URL,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

function getKey(path: string) {
  return trimStart(path, "/");
}

async function streamToBuffer(stream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

export async function upload(
  key: string,
  data: Buffer,
  bucket: string | null = null
): Promise<string> {
  logger.debug(`Upload file ${key}`);
  try {
    const { mime } = await fileTypeFromBuffer(data);
    const target = bucket || S3_DEFAULT_BUCKET_NAME;
    const {
      $metadata: { httpStatusCode },
    } = await s3.send(
      new PutObjectCommand({
        Bucket: target,
        Key: getKey(key),
        Body: data,
        ACL: "public-read",
        ContentType: mime,
      })
    );
    logger.debug(`Server returned ${httpStatusCode}`);
    return [S3_BASE_URL, target, key].join("/");
  } catch (e) {
    logger.error(e);
    sentry.captureException(e);
    throw new DataError("Can't upload file");
  }
}

export async function load(
  key: string,
  bucket: string = S3_DEFAULT_BUCKET_NAME
): Promise<Buffer> {
  try {
    const data = (await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: getKey(key),
      })
    )) as GetObjectCommandOutput;

    return streamToBuffer(data.Body);
  } catch (e) {
    const {
      $metadata: { httpStatusCode },
    } = e;
    if (httpStatusCode === 404) {
      throw new Error("File not found");
    }
    sentry.captureException(e);
    logger.error(e);
  }

  throw new Error("Can't load file contents");
}

export async function exists(
  key: string,
  bucket: string = S3_DEFAULT_BUCKET_NAME
): Promise<boolean> {
  try {
    const {
      $metadata: { httpStatusCode },
    } = await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: getKey(key),
      })
    );
    if (httpStatusCode === 200) {
      return true;
    }
  } catch (e) {
    const {
      $metadata: { httpStatusCode },
    } = e;
    if (httpStatusCode === 404) {
      return false;
    }
    sentry.captureException(e);
    logger.error(e);
  }

  throw new Error("Unknown http code");
}

export async function remove(
  key: string,
  bucket: string = S3_DEFAULT_BUCKET_NAME
): Promise<void> {
  logger.debug(`Remove file ${key}`);

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: getKey(key),
      })
    );
  } catch (e) {
    const {
      $metadata: { httpStatusCode },
    } = e;
    if (httpStatusCode !== 404) {
      logger.error(e);
      sentry.captureException(e);
      throw new DataError("Can't remove file");
    } else {
      logger.warn("File does not exists");
    }
  }
}

export async function copy(
  fromKey: string,
  toKey: string,
  fromBucket: string = S3_DEFAULT_BUCKET_NAME,
  toBucket: string = S3_DEFAULT_BUCKET_NAME
): Promise<void> {
  logger.debug(`Copy file ${fromBucket}/${fromKey} to ${toBucket}/${toKey}`);

  try {
    const {
      $metadata: { httpStatusCode },
    } = await s3.send(
      new CopyObjectCommand({
        Bucket: toBucket,
        CopySource: `${fromBucket}/${getKey(fromKey)}`,
        Key: getKey(toKey),
        ACL: "public-read",
      })
    );
    logger.debug(`Server returned ${httpStatusCode}`);
  } catch (e) {
    const {
      $metadata: { httpStatusCode },
    } = e;
    if (httpStatusCode !== 404) {
      logger.error(e);
      sentry.captureException(e);
      throw new DataError("Can't copy file");
    } else {
      logger.warn("File does not exists");
    }
  }
}
