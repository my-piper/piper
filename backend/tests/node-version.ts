const [major] = process.versions.node.split(".").map(Number);
if (major !== 26) {
  throw new Error(
    `Backend tests need Node.js 26 (see .nvmrc); found ${process.version}`
  );
}
