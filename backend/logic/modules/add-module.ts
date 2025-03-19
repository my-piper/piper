import { PackageJson } from "models/package-json";
import { readInstance, saveInstance } from "utils/redis";
import { PACKAGE_JSON_KEY } from "./consts";

export async function add(name: string, version: string) {
  const packageJson =
    (await readInstance(PACKAGE_JSON_KEY, PackageJson)) ||
    new PackageJson({
      name: "packages",
      version: "1.0.0",
      dependencies: new Map<string, string>(),
    });
  packageJson.dependencies.set(name, version);
  await saveInstance(PACKAGE_JSON_KEY, packageJson);
}
