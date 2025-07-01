import { PackageJson } from "models/package-json";
import { readInstance } from "utils/redis";
import { PACKAGE_JSON_KEY } from "./consts";

export async function list(): Promise<PackageJson> {
  return await readInstance(PACKAGE_JSON_KEY, PackageJson);
}
