import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
} from "@angular/router";
import { Observable } from "rxjs";
import { Deploy } from "src/models/deploy";
import { NotFoundError } from "src/models/errors";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { DeployResolver } from "src/resolvers/deploy";
import { LaunchResolver } from "src/resolvers/launch";
import {
  NodeFromLaunchResolver,
  NodeFromProjectResolver,
} from "src/resolvers/node";
import { ProjectResolver } from "src/resolvers/project";
import { ProjectManager } from "src/services/project.manager";
import { launch, projectA } from "../../fixtures/models";
import {
  environmentPlain,
  LAUNCH_ID,
  launchPlain,
  launchRequestPlain,
  PROJECT_A_ID,
  projectAPlain,
  smallGraphPipeline,
} from "../../fixtures/plain";
import { provideTestConfig } from "../../helpers/config";

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideTestConfig(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

function route(
  params: Record<string, string>,
  parentData: Record<string, unknown> = {},
) {
  return {
    params,
    parent: { data: parentData },
  } as unknown as ActivatedRouteSnapshot;
}

function capture<T>(source: Observable<T>) {
  const result: { value?: T; error?: unknown } = {};
  source.subscribe({
    next: (value) => (result.value = value),
    error: (error) => (result.error = error),
  });
  return result;
}

const state = {} as RouterStateSnapshot;

describe("route resolvers", () => {
  describe("ProjectResolver", () => {
    it("loads a typed project and hands it to the project manager", () => {
      const controller = setup();
      const resolver = TestBed.inject(ProjectResolver);

      const result = capture(resolver.resolve(route({ id: PROJECT_A_ID })));
      controller
        .expectOne(`/api/projects/${PROJECT_A_ID}`)
        .flush(projectAPlain());

      expect(result.value).toBeInstanceOf(Project);
      expect(result.value.pipeline.nodes.get("node_one")).toBeInstanceOf(Node);
      expect(result.value.createdAt).toEqual(
        new Date("2026-02-01T10:00:00.000Z"),
      );
      expect(TestBed.inject(ProjectManager).project).toBe(result.value);
      controller.verify();
    });

    it("propagates a missing project without touching the project manager", () => {
      spyOn(console, "error");
      const controller = setup();
      const manager = TestBed.inject(ProjectManager);
      manager.project = projectA();
      const previous = manager.project;

      const result = capture(
        TestBed.inject(ProjectResolver).resolve(route({ id: "missing" })),
      );
      controller
        .expectOne("/api/projects/missing")
        .flush("Not found", { status: 404, statusText: "Not Found" });

      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(manager.project).toBe(previous);
      controller.verify();
    });
  });

  describe("LaunchResolver", () => {
    it("prefers the launch parameter over id", () => {
      const controller = setup();

      const result = capture(
        TestBed.inject(LaunchResolver).resolve(
          route({ id: PROJECT_A_ID, launch: LAUNCH_ID }),
        ),
      );
      controller.expectOne(`/api/launches/${LAUNCH_ID}`).flush(launchPlain());

      expect(result.value).toBeInstanceOf(Launch);
      expect(result.value.launchedAt).toEqual(
        new Date("2026-03-01T12:00:00.000Z"),
      );
      expect(result.value.pipeline.nodes.size).toBe(2);
      controller.verify();
    });

    it("falls back to id when no launch parameter is present", () => {
      const controller = setup();

      capture(TestBed.inject(LaunchResolver).resolve(route({ id: LAUNCH_ID })));
      const req = controller.expectOne(`/api/launches/${LAUNCH_ID}`);
      req.flush(launchPlain());

      expect(req.request.method).toBe("GET");
      controller.verify();
    });
  });

  describe("node resolvers", () => {
    it("reads the node from the parent project", () => {
      setup();
      const project = projectA();

      const result = TestBed.inject(NodeFromProjectResolver).resolve(
        route({ id: "node_two" }, { project }),
        state,
      ) as { id: string; node: Node };

      expect(result.id).toBe("node_two");
      expect(result.node).toBe(project.pipeline.nodes.get("node_two"));
    });

    it("reads the node from the parent launch", () => {
      setup();
      const parent = launch();

      const result = TestBed.inject(NodeFromLaunchResolver).resolve(
        route({ id: "node_one" }, { launch: parent }),
        state,
      ) as { id: string; node: Node };

      expect(result.node).toBe(parent.pipeline.nodes.get("node_one"));
    });

    it("returns an undefined node for an unknown id", () => {
      setup();

      const result = TestBed.inject(NodeFromProjectResolver).resolve(
        route({ id: "ghost" }, { project: projectA() }),
        state,
      ) as { id: string; node: Node };

      expect(result.id).toBe("ghost");
      expect(result.node).toBeUndefined();
    });
  });

  describe("DeployResolver", () => {
    const deployPlain = () => ({
      _id: "deploy_one",
      deployedAt: "2026-03-02T00:00:00.000Z",
      prefix: "team",
      slug: "small-graph",
      pipeline: smallGraphPipeline(),
      launchRequest: launchRequestPlain(),
      environment: environmentPlain(),
    });

    it("loads a prefixed deploy", () => {
      const controller = setup();

      const result = capture(
        TestBed.inject(DeployResolver).resolve(
          route({ prefix: "team", slug: "small-graph" }),
        ),
      );
      controller.expectOne("/api/team/small-graph").flush(deployPlain());

      expect(result.value).toBeInstanceOf(Deploy);
      expect(result.value.deployedAt).toEqual(
        new Date("2026-03-02T00:00:00.000Z"),
      );
      expect(result.value.launchRequest.inputs.get("zero")).toBe(0);
      controller.verify();
    });

    it("omits a missing optional prefix", () => {
      const controller = setup();

      capture(
        TestBed.inject(DeployResolver).resolve(route({ slug: "small-graph" })),
      );
      const req = controller.expectOne("/api/small-graph");
      req.flush(deployPlain());

      expect(req.request.method).toBe("GET");
      controller.verify();
    });
  });
});
