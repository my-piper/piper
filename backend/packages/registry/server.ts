import { REGISTRY_TOKEN } from "consts/registry";
import { createLogger } from "core-kit/packages/logger";
import express, { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { posix } from "node:path";
import { contentType } from "./content-type";
import { getFile } from "./files";

const logger = createLogger("registry");

const FILE = /^\/([a-z0-9_]+)\/(\d+)\/(.+)$/;

function authorized(header: string | undefined): boolean {
  if (!REGISTRY_TOKEN) {
    return true;
  }

  if (!header) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${REGISTRY_TOKEN}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The file path inside a package version, or null when it would leave it.
function filePath(encoded: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  const normalized = posix.normalize(path);
  if (normalized !== path || normalized.startsWith("../")) {
    return null;
  }
  return path;
}

// Serves Package Registry files to Deno. A published version never changes,
// so files may be cached forever.
export function createRegistryApp() {
  const app = express();
  app.disable("x-powered-by");

  app.get(FILE, async (req: Request, res: Response) => {
    if (!authorized(req.headers.authorization)) {
      res.sendStatus(401);
      return;
    }

    const [, nodePackage, version, encoded] = FILE.exec(req.path);
    const path = filePath(encoded);
    if (!path) {
      res.sendStatus(404);
      return;
    }

    try {
      const data = await getFile(nodePackage, parseInt(version), path);
      if (!data) {
        res.sendStatus(404);
        return;
      }
      res.set("Content-Type", contentType(path));
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.send(data);
    } catch (e) {
      logger.error(e);
      res.sendStatus(502);
    }
  });

  app.use((_req: Request, res: Response) => {
    res.sendStatus(404);
  });

  return app;
}
