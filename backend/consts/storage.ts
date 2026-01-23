import "core-kit/env";

export const ASSETS_BUCKET_NAME = process.env["ASSETS_BUCKET_NAME"] || "assets";
export const ARTEFACTS_BUCKET_NAME =
  process.env["ARTEFACTS_BUCKET_NAME"] || "artefacts";
export const OUTPUTS_BUCKET_NAME =
  process.env["OUTPUTS_BUCKET_NAME"] || "outputs";
