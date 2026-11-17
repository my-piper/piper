import { readFileSync } from "node:fs";

const nvmrc = new URL("../.nvmrc", import.meta.url);
const required = Number(readFileSync(nvmrc, "utf8").trim().split(".")[0]);
const [major] = process.versions.node.split(".").map(Number);
if (major !== required) {
  throw new Error(
    `Backend tests need Node.js ${required} (see .nvmrc); found ${process.version}`
  );
}
