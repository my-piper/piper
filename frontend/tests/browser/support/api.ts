import { BrowserContext, Request, Route } from "@playwright/test";
import Ajv from "ajv";
import { patch } from "jsondiffpatch";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  authorizationPlain,
  patchResponsePlain,
  Plain,
  projectAPlain,
  USER_IDS,
  userPlain,
  UserKind,
} from "../../fixtures/plain";

/**
 * Stateful per-test HTTP fixture for `/api/**`. Each handler mirrors one
 * backend route (cited inline) closely enough that the frontend cannot pass
 * against a shape the real backend never produces. Requests that no handler
 * claims are answered with 501 and recorded in `unhandled`; the test fixture
 * fails the test when that list is not empty.
 */

const SCHEMAS = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../src/schemas/compiled.json"),
    "utf-8",
  ),
) as { pipeline: object };

const ajv = new Ajv({ strict: false, allErrors: false });
for (const format of ["number", "url", "textarea"]) {
  ajv.addFormat(format, () => true);
}
const validatePipeline = ajv.compile(SCHEMAS.pipeline);

export type ApiCall = {
  method: string;
  path: string;
  body: unknown;
  status: number;
};

type Reply = { status: number; json?: unknown; text?: string };

type Handler = (args: {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  user: Plain | null;
}) => Reply | Promise<Reply>;

type Override = {
  method: string;
  pattern: RegExp;
  reply: Reply;
  times: number;
};

export const CREDENTIALS = { identity: "owner@piper.test", password: "secret" };

const clone = <T>(value: T): T => structuredClone(value);

/** Text body like backend `handle()` sends for DataError without details. */
const dataError = (message: string): Reply => ({ status: 400, text: message });
const ok = (json: unknown): Reply =>
  json === null ? { status: 204 } : { status: 200, json };

export class ApiFixture {
  readonly calls: ApiCall[] = [];
  readonly unhandled: string[] = [];

  projects = new Map<string, Plain>([
    [projectAPlain()["_id"] as string, projectAPlain()],
  ]);
  /** Node catalog served by GET /api/nodes and GET /api/nodes/:id. */
  catalog: Plain[] = [catalogNode()];
  deploys: Plain[] = [];
  launches = new Map<string, Plain>();
  /** Redis-backed node state, keyed `launch/node`. */
  nodeStatus = new Map<string, Plain>();
  nodeOutputs = new Map<string, Plain>();
  readonly interrupted: string[] = [];

  private revision = 1;
  private overrides: Override[] = [];
  private routes: [string, RegExp, Handler][] = [];

  constructor() {
    this.register();
  }

  /** Answers the next `times` matching requests with `reply` instead. */
  override(method: string, pattern: RegExp, reply: Reply, times = 1) {
    this.overrides.push({ method, pattern, reply, times });
  }

  on(method: string, pattern: string, handler: Handler) {
    const regex = new RegExp(
      "^" + pattern.replace(/:([a-zA-Z_]+)/g, "(?<$1>[^/]+)") + "$",
    );
    // Later registrations win, so tests can replace a default handler.
    this.routes.unshift([method, regex, handler]);
  }

  callsTo(method: string, pattern: RegExp): ApiCall[] {
    return this.calls.filter(
      (c) => c.method === method && pattern.test(c.path),
    );
  }

  async attach(context: BrowserContext) {
    await context.route("**/api/**", (route) => this.handle(route));
  }

  private userFor(request: Request): Plain | null {
    const token = request.headers()["user-token"];
    const kind = (Object.keys(USER_IDS) as UserKind[]).find(
      (k) => authorizationPlain(k)["token"] === token,
    );
    return kind ? userPlain(kind) : null;
  }

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const raw = request.postData();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      // text/plain bodies stay as strings
    }

    let reply: Reply | null = null;
    const override = this.overrides.find(
      (o) => o.method === method && o.pattern.test(url.pathname),
    );
    if (override) {
      override.times--;
      if (override.times <= 0) {
        this.overrides.splice(this.overrides.indexOf(override), 1);
      }
      reply = override.reply;
    } else {
      for (const [m, regex, handler] of this.routes) {
        const match = m === method ? regex.exec(url.pathname) : null;
        if (match) {
          reply = await handler({
            params: { ...match.groups },
            query: url.searchParams,
            body,
            user: this.userFor(request),
          });
          break;
        }
      }
    }

    if (!reply) {
      this.unhandled.push(`${method} ${url.pathname}${url.search}`);
      reply = { status: 501, text: "Unhandled by browser API fixture" };
    }

    this.calls.push({ method, path: url.pathname, body, status: reply.status });
    if (reply.json !== undefined) {
      await route.fulfill({ status: reply.status, json: reply.json });
    } else {
      await route.fulfill({
        status: reply.status,
        contentType: "text/plain",
        body: reply.text ?? "",
      });
    }
  }

  private requireUser(user: Plain | null): Reply | null {
    // backend/utils/http.ts checkLogged: DataError "You aren't logged".
    return user ? null : dataError("You aren't logged");
  }

  private register() {
    // backend/api/users/login.ts
    this.on("POST", "/api/login", ({ body }) => {
      const { identity, password } = body as Plain;
      if (
        identity !== CREDENTIALS.identity ||
        password !== CREDENTIALS.password
      ) {
        return dataError("Email or password is incorrect");
      }
      return ok(authorizationPlain("owner"));
    });

    // backend/api/me/get-me.ts
    this.on("GET", "/api/me", ({ user }) => this.requireUser(user) ?? ok(user));

    // backend/api/projects/list.ts (array, PAGE_SIZE ignored here):
    // `group` picks one folder, `ungrouped=true` the projects outside any
    this.on("GET", "/api/projects", ({ query, user }) => {
      const group = query.get("group");
      const ungrouped = query.get("ungrouped") === "true";
      const projects = [...this.projects.values()].filter((p) =>
        group ? p["group"] === group : ungrouped ? !p["group"] : true,
      );
      return this.requireUser(user) ?? ok(clone(projects));
    });

    // backend/api/projects/tags/list-available-tags.ts: distinct sorted tags
    this.on("GET", "/api/projects/tags/available", ({ user }) => {
      const tags = [...this.projects.values()].flatMap(
        (p) => (p["tags"] as string[] | undefined) ?? [],
      );
      return (
        this.requireUser(user) ?? ok([...new Set(tags)].filter(Boolean).sort())
      );
    });

    // backend/api/projects/get-project.ts: matches `_id` or `slug`, masks
    // string environment variables with HIDDEN_STRING (consts/core.ts).
    this.on("GET", "/api/projects/:id", ({ params, user }) => {
      const denied = this.requireUser(user);
      if (denied) {
        return denied;
      }
      const project = [...this.projects.values()].find(
        (p) => p["_id"] === params["id"] || p["slug"] === params["id"],
      );
      if (!project) {
        return { status: 404, text: "Project not found" };
      }
      const plain = clone(project);
      const variables = (plain["environment"] as Plain)?.["variables"] as Plain;
      for (const key of Object.keys(variables || {})) {
        if (typeof variables[key] === "string") {
          variables[key] = "[encrypted]";
        }
      }
      return ok(plain);
    });

    // backend/api/projects/groups/list-groups.ts: distinct sorted groups.
    // Registered after `:id` so the static path wins.
    this.on("GET", "/api/projects/groups", ({ user }) => {
      const groups = [...this.projects.values()].map(
        (p) => p["group"] as string | undefined,
      );
      return (
        this.requireUser(user) ??
        ok([...new Set(groups)].filter(Boolean).sort())
      );
    });

    // backend/api/projects/groups/list-group-counts.ts: projects per group,
    // sorted by group. Registered after `:id` so the static path wins.
    this.on("GET", "/api/projects/groups/counts", ({ user }) => {
      const counts = new Map<string, number>();
      for (const p of this.projects.values()) {
        const group = p["group"] as string | undefined;
        if (group) {
          counts.set(group, (counts.get(group) ?? 0) + 1);
        }
      }
      return (
        this.requireUser(user) ??
        ok(
          [...counts.keys()]
            .sort()
            .map((group) => ({ group, count: counts.get(group) })),
        )
      );
    });

    // backend/api/projects/check-node-updates.ts
    this.on("GET", "/api/projects/:id/check-node-updates", () =>
      ok({ updates: {} }),
    );

    // backend/api/projects/get-project-summary.ts
    this.on("GET", "/api/projects/:id/summary", () => ok({ comments: 0 }));

    // backend/api/projects/patch-project.ts
    this.on(
      "PATCH",
      "/api/projects/:id/patch/:revision",
      ({ params, body, user }) => {
        const denied = this.requireUser(user);
        if (denied) {
          return denied;
        }
        const project = this.projects.get(params["id"]);
        if (!project) {
          return { status: 404, text: "Not found" };
        }
        if (params["revision"] !== project["revision"]) {
          return dataError(
            `Version on sever is more fresh version ${project["revision"]}`,
          );
        }

        const request = body as Plain;
        const next = clone(project);
        if (request["pipeline"]) {
          patch(next["pipeline"], request["pipeline"] as never);
          if (!validatePipeline(next["pipeline"])) {
            return {
              status: 400,
              json: {
                message: "Pipeline schema invalid",
                details: (validatePipeline.errors || []).map((e) =>
                  [e.instancePath || e.schemaPath, e.message].join(": "),
                ),
              },
            };
          }
          next["title"] = (next["pipeline"] as Plain)["name"];
        }
        for (const key of ["launchRequest", "environment"]) {
          if (request[key]) {
            next[key] ??=
              key === "launchRequest"
                ? { inputs: {}, nodes: {} }
                : { variables: {} };
            patch(next[key], request[key] as never);
          }
        }
        next["revision"] = `rev_${params["id"]}_${++this.revision}`;
        this.projects.set(params["id"], next);
        return ok(patchResponsePlain(next["revision"] as string));
      },
    );

    // backend/api/projects/get-launch-costs.ts
    this.on("POST", "/api/projects/:id/launch-costs", () =>
      ok({ costs: 0, nodes: {}, total: 0 }),
    );

    // backend/api/projects/launch-project.ts: merges the body over the stored
    // launch request and returns the launch without `pipeline`.
    this.on("POST", "/api/projects/:id/launch", ({ params, body, user }) => {
      const denied = this.requireUser(user);
      if (denied) {
        return denied;
      }
      const project = this.projects.get(params["id"]);
      if (!project) {
        return { status: 404, text: "Not found" };
      }
      const request = body as Plain;
      const stored = project["launchRequest"] as Plain;
      const launchRequest = {
        ...stored,
        ...request,
        inputs: {
          ...(stored["inputs"] as Plain),
          ...(request["inputs"] as Plain),
        },
      };
      const outputs: Plain = {};
      const pipeline = project["pipeline"] as Plain;
      for (const [key, output] of Object.entries(
        (pipeline["outputs"] as Record<string, Plain>) || {},
      )) {
        outputs[key] = {
          type: output["type"],
          title: output["title"],
          order: output["order"],
        };
      }
      const _id = `launch_${this.launches.size + 1}`;
      const launch: Plain = {
        _id,
        launchedAt: new Date().toISOString(),
        launchedBy: { _id: user["_id"] },
        project: {
          _id: project["_id"],
          title: project["title"],
          createdBy: project["createdBy"],
        },
        launchRequest,
        inputs: {},
        outputs,
        comment: "UI call",
        cursor: _id,
      };
      this.launches.set(_id, { ...launch, pipeline: clone(pipeline) });
      return ok(launch);
    });

    // backend/api/launches/list.ts: own launches, newest first.
    this.on("GET", "/api/launches", ({ query, user }) => {
      const denied = this.requireUser(user);
      if (denied) {
        return denied;
      }
      const project = query.get("project");
      return ok(
        [...this.launches.values()]
          .reverse()
          .filter((l) => !project || (l["project"] as Plain)["_id"] === project)
          .map(({ pipeline, ...launch }) => (void pipeline, clone(launch))),
      );
    });

    // backend/api/launches/heartbeat.ts and metrics/finished.ts: null → 204
    this.on("GET", "/api/launches/:id/heartbeat", () => ok(null));
    this.on("GET", "/api/launches/:id/metrics/finished", () => ok(null));

    // backend/api/launches/interrupt-launch.ts
    this.on("POST", "/api/launches/:id/interrupt", ({ params, user }) => {
      const denied = this.requireUser(user);
      if (denied) {
        return denied;
      }
      if (!this.launches.has(params["id"])) {
        return { status: 404, text: "Not found" };
      }
      this.interrupted.push(params["id"]);
      return ok(null);
    });

    // backend/api/launches/nodes/node-{status,progress,outputs}.ts read Redis.
    this.on("GET", "/api/launches/:launch/:node/status", ({ params }) =>
      ok(this.nodeStatus.get(`${params["launch"]}/${params["node"]}`) ?? null),
    );
    this.on("GET", "/api/launches/:launch/:node/progress", () => ok(null));
    this.on("GET", "/api/launches/:launch/:node/outputs", ({ params }) =>
      ok(this.nodeOutputs.get(`${params["launch"]}/${params["node"]}`) ?? {}),
    );
    // backend/api/launches/nodes/node-inputs.ts
    this.on("GET", "/api/launches/:launch/:node/inputs", ({ params }) =>
      this.launches.has(params["launch"])
        ? ok({})
        : dataError("Launch is not found"),
    );

    // backend/api/launches/get-launch.ts: findOne → null → 204
    this.on("GET", "/api/launches/:id", ({ params }) => {
      const launch = this.launches.get(params["id"]);
      return ok(launch ? clone(launch) : null);
    });

    // backend/api/nodes/list.ts
    this.on("GET", "/api/nodes", () => ok(clone(this.catalog)));

    // backend/api/nodes/get-node.ts
    this.on("GET", "/api/nodes/:id", ({ params }) => {
      const node = this.catalog.find((n) => n["_id"] === params["id"]);
      return node ? ok(clone(node)) : { status: 404, text: "Node not found" };
    });

    // backend/api/projects/deploys/list.ts (projection: _id, slug, prefix, deployedAt)
    this.on("GET", "/api/projects/:project/deploys", ({ params, user }) => {
      return (
        this.requireUser(user) ??
        ok(
          this.deploys
            .filter((d) => (d["project"] as Plain)["_id"] === params["project"])
            .map(({ _id, slug, prefix, deployedAt }) => ({
              _id,
              slug,
              prefix,
              deployedAt,
            })),
        )
      );
    });

    // backend/api/projects/deploy-project.ts: returns null (204)
    this.on("POST", "/api/projects/:id/deploy", ({ params, body, user }) => {
      const denied = this.requireUser(user);
      if (denied) {
        return denied;
      }
      const { prefix, slug } = body as Plain;
      const admin = (user["roles"] as string[]).includes("admin");
      if (!admin && prefix !== user["_id"]) {
        return dataError("You can't deploy this project in this prefix");
      }
      const _id = [...(prefix ? [prefix] : []), slug].join("_");
      this.deploys = this.deploys.filter((d) => d["_id"] !== _id);
      this.deploys.unshift({
        _id,
        prefix,
        slug,
        deployedAt: new Date().toISOString(),
        project: { _id: params["id"] },
      });
      return ok(null);
    });

    // backend/api/deploys/remove-deploy.ts: `/api/deploys/:slug` requires
    // admin when no prefix segment is given; `/api/deploys/:prefix/:slug`.
    const remove: Handler = ({ params, user }) => {
      const denied = this.requireUser(user);
      if (denied) {
        return denied;
      }
      const { prefix, slug } = params;
      if (!prefix && !(user["roles"] as string[]).includes("admin")) {
        return dataError("You aren't admin");
      }
      const _id = [...(prefix ? [prefix] : []), slug].join("_");
      this.deploys = this.deploys.filter((d) => d["_id"] !== _id);
      return ok(null);
    };
    this.on("DELETE", "/api/deploys/:slug", remove);
    this.on("DELETE", "/api/deploys/:prefix/:slug", remove);
  }
}

/** A catalog node as GET /api/nodes returns it (backend/models/node.ts). */
export function catalogNode(): Plain {
  return {
    _id: "uppercase",
    title: "Uppercase",
    version: 1,
    description: "Makes text loud",
    execution: "rapid",
    category: { _id: "text_tools", title: "Text", order: 1 },
    tags: [],
    arrange: { x: 0, y: 0 },
    script: "export async function run() { return {}; }",
    inputs: {
      text: { order: 1, title: "Loud input", type: "string", featured: true },
    },
    outputs: { loud: { title: "Loud output", type: "string" } },
  };
}
