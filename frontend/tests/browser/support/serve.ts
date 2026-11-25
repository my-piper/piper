/**
 * Serves the browser-test build with the workflows' fixture API on a fixed
 * port, for looking at pages by hand or with a browser tool: no backend,
 * database or real account. Run it with `npm run browser:serve`; sign in with
 * the printed fixture credentials. State lives in memory and resets on
 * restart.
 */
import process from "node:process";
import { ApiFixture, CREDENTIALS } from "./api";
import { FixtureServer, LOCALES } from "./server";

const port = Number(process.env["PORT"] || 4300);
const api = new ApiFixture();

const server = new FixtureServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", async () => {
    const raw = chunks.length > 0 ? Buffer.concat(chunks).toString() : null;
    const token = req.headers["user-token"];
    const reply = await api.respond(
      req.method,
      new URL(req.url, "http://fixture"),
      raw,
      Array.isArray(token) ? token[0] : token,
    );
    if (reply.json !== undefined) {
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.json));
    } else {
      res.writeHead(reply.status, { "content-type": "text/plain" });
      res.end(reply.text ?? "");
    }
  });
});

await server.start(port);
console.log(`Piper fixture app: ${server.url}/en/projects`);
console.log(`Locales: ${LOCALES.join(", ")}`);
console.log(
  `Sign in as ${CREDENTIALS.identity} / ${CREDENTIALS.password}; Ctrl+C stops.`,
);
setInterval(() => {
  if (api.unhandled.length > 0) {
    console.warn(`Unhandled by the fixture API: ${api.unhandled.join(", ")}`);
    api.unhandled.length = 0;
  }
}, 1000);
