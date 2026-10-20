import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";
import { Server as IoServer, Socket } from "socket.io";
import {
  PlainAppConfig,
  testRuntimeConfig,
} from "../../fixtures/runtime-config";

/**
 * Loopback fixture peer for browser workflows:
 *
 * - serves the localized build from `dist-browser/<locale>/` with SPA fallback,
 *   replacing the `PRERENDER = {};` constant in index.html in memory exactly as
 *   backend/server.ts does (built files are never modified);
 * - hosts a real Socket.IO server on the same origin (the app connects to `/`
 *   with the websocket transport) handling `join_room` / `leave_room` like
 *   backend/sockets.ts.
 *
 * `/api/**` is never answered here: each test routes it through its own
 * stateful HTTP fixture (see api.ts), so an unrouted API call surfaces as 404.
 */

export const DIST = path.resolve(import.meta.dirname, "../../../dist-browser");
export const LOCALES = ["en", "ru"] as const;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const PRERENDER_PLACEHOLDER = "PRERENDER = {};";

export type RoomEvent = { type: "join" | "leave"; room: string; at: number };

export class FixtureServer {
  config: PlainAppConfig = testRuntimeConfig();
  readonly roomEvents: RoomEvent[] = [];

  private http: HttpServer;
  private io: IoServer;
  private sockets = new Set<Socket>();

  get url() {
    const { port } = this.http.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async start() {
    for (const locale of LOCALES) {
      const index = path.join(DIST, locale, "index.html");
      if (!existsSync(index)) {
        throw new Error(
          `${index} is missing: run "npm run test:browser" (it builds first)`,
        );
      }
    }

    this.http = createServer((req, res) => {
      const url = new URL(req.url, "http://fixture");
      const [, locale] = url.pathname.split("/");
      if (!(LOCALES as readonly string[]).includes(locale)) {
        res.writeHead(404).end(`Fixture server: no route ${url.pathname}`);
        return;
      }

      const root = path.join(DIST, locale);
      const file = path.normalize(
        path.join(DIST, decodeURIComponent(url.pathname)),
      );
      if (
        file.startsWith(root + path.sep) &&
        existsSync(file) &&
        statSync(file).isFile()
      ) {
        res.writeHead(200, {
          "content-type":
            MIME[path.extname(file)] || "application/octet-stream",
        });
        res.end(readFileSync(file));
        return;
      }

      res.writeHead(200, {
        "content-type": MIME[".html"],
        "cache-control": "no-store",
      });
      res.end(this.index(locale));
    });

    this.io = new IoServer(this.http, { transports: ["websocket"] });
    this.io.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("join_room", (room: string) => {
        this.roomEvents.push({ type: "join", room, at: Date.now() });
        socket.join(room);
      });
      socket.on("leave_room", (room: string) => {
        this.roomEvents.push({ type: "leave", room, at: Date.now() });
        socket.leave(room);
      });
      socket.on("disconnect", () => this.sockets.delete(socket));
    });

    await new Promise<void>((resolve) =>
      this.http.listen(0, "127.0.0.1", resolve),
    );
  }

  /** Resets per-test state; called between tests. */
  reset(config: PlainAppConfig = testRuntimeConfig()) {
    this.config = config;
    this.roomEvents.length = 0;
    for (const socket of this.sockets) {
      socket.disconnect(true);
    }
  }

  /** Emits a server event into a room, like core-kit `notify()`. */
  emit(room: string, event: string, payload: unknown) {
    this.io.to(room).emit(event, payload);
  }

  async stop() {
    this.io.close();
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }

  private index(locale: string): string {
    const html = readFileSync(path.join(DIST, locale, "index.html"), "utf-8");
    const occurrences = html.split(PRERENDER_PLACEHOLDER).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Expected exactly one "${PRERENDER_PLACEHOLDER}" in ${locale}/index.html, found ${occurrences}`,
      );
    }
    return html.replace(
      PRERENDER_PLACEHOLDER,
      `PRERENDER = ${JSON.stringify({ config: this.config })};`,
    );
  }
}
