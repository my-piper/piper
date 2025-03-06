import "core-kit/env";

export const ARTEFACTS_BUCKET_NAME =
  process.env["ARTEFACTS_BUCKET_NAME"] || "artefacts";
export const LAUNCHES_BUCKET_NAME =
  process.env["LAUNCHES_BUCKET_NAME"] || "launches";
export const ASSETS_BUCKET_NAME = process.env["ASSETS_BUCKET_NAME"] || "assets";
