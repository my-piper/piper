import { readInstance } from "core-kit/packages/redis";
import { PackageJson } from "models/package-json";
import { PACKAGE_JSON_KEY } from "./consts";

export async function list(): Promise<PackageJson> {
  return await readInstance(PACKAGE_JSON_KEY, PackageJson);
}
