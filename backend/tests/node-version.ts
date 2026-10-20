// Node 25 removed SlowBuffer, which jsonwebtoken's jwa dependency still uses.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12) || major >= 25) {
  throw new Error(
    `Backend tests need Node.js >=22.12 <25 (see .nvmrc); found ${process.version}`
  );
}
