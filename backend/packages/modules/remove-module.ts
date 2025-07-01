import { DataError } from "core-kit/types/errors";
import { PackageJson } from "models/package-json";
import { readInstance, saveInstance } from "utils/redis";
import { PACKAGE_JSON_KEY } from "./consts";

export async function remove(name: string) {
  const packageJson = await readInstance(PACKAGE_JSON_KEY, PackageJson);
  if (!packageJson) {
    throw new DataError("Package JSON not found");
  }
  packageJson.dependencies.delete(name);
  await saveInstance(PACKAGE_JSON_KEY, packageJson);
}
