import "core-kit/env";

export const S3_ACCESS_KEY_ID = process.env["S3_ACCESS_KEY_ID"] || "xyzXYZ";
export const S3_SECRET_ACCESS_KEY =
  process.env["S3_SECRET_ACCESS_KEY"] || "xyzXYZ";
export const S3_ENDPOINT_URL =
  process.env["S3_ENDPOINT_URL"] || "https://xyzXYZ.r2.cloudflarestorage.com";
export const S3_DEFAULT_REGION = process.env["S3_DEFAULT_REGION"] || "auto";
export const S3_DEFAULT_BUCKET_NAME =
  process.env["S3_DEFAULT_BUCKET_NAME"] || "xyz-media";
export const S3_BASE_URL =
  process.env["S3_BASE_URL"] || "https://xyzXYZ.r2.cloudflarestorage.com";
