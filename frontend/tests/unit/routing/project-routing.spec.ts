import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { Component } from "@angular/core";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import {
  ActivatedRoute,
  provideRouter,
  Router,
  RouterOutlet,
  Routes,
  UrlSegment,
} from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { projectIdMatcher } from "src/app/app-routing.module";
import { SaveProjectGuard } from "src/guards/save-project.guard";
import { SigninNeededGuard } from "src/guards/signin.guard";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { NodeFromProjectResolver } from "src/resolvers/node";
import { ProjectResolver } from "src/resolvers/project";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import {
  PATCH_PROJECT_URL,
  patchResponsePlain,
  PROJECT_A_ID,
  projectAPlain,
  userPlain,
} from "../../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../../helpers/config";

function segments(...paths: string[]) {
  return paths.map((p) => new UrlSegment(p, {}));
}

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: `<h1>{{ project?.title }}</h1>
    <router-outlet name="right"></router-outlet>`,
})
class ProjectStubComponent {
  project: Project;

  constructor(route: ActivatedRoute) {
    route.data.subscribe(({ project }) => (this.project = project));
  }
}

@Component({
  standalone: true,
  template: `<aside class="node">{{ node?.title }}</aside>`,
})
class NodeStubComponent {
  node: Node;

  constructor(route: ActivatedRoute) {
    route.data.subscribe(({ node }) => (this.node = node.node));
  }
}

@Component({ standalone: true, template: `<p>page</p>` })
class PageStubComponent {}

// Mirrors the project route in src/app/app-routing.module.ts.
const routes: Routes = [
  { path: "login", component: PageStubComponent },
  { path: "projects/import", component: PageStubComponent },
  {
    matcher: projectIdMatcher,
    component: ProjectStubComponent,
    canActivate: [SigninNeededGuard],
    canDeactivate: [SaveProjectGuard],
    resolve: { project: ProjectResolver },
    children: [
      {
        path: "nodes/:id",
        component: NodeStubComponent,
        outlet: "right",
        resolve: { node: NodeFromProjectResolver },
      },
    ],
  },
  { path: "elsewhere", component: PageStubComponent },
];

describe("project routing", () => {
  describe("projectIdMatcher", () => {
    it("matches /projects/:id and exposes the id", () => {
      const result = projectIdMatcher(segments("projects", PROJECT_A_ID));

      expect(result.consumed.map((s) => s.path)).toEqual([
        "projects",
        PROJECT_A_ID,
      ]);
      expect(result.posParams["id"].path).toBe(PROJECT_A_ID);
    });

    it("consumes only the id prefix of deeper URLs", () => {
      const result = projectIdMatcher(
        segments("projects", PROJECT_A_ID, "artefacts"),
      );

      expect(result.consumed.length).toBe(2);
    });

    it("leaves /projects/import and /projects to other routes", () => {
      expect(projectIdMatcher(segments("projects", "import"))).toBeNull();
      expect(projectIdMatcher(segments("projects"))).toBeNull();
      expect(projectIdMatcher(segments("launches", PROJECT_A_ID))).toBeNull();
    });
  });

  describe("with a real router", () => {
    let harness: RouterTestingHarness;
    let controller: HttpTestingController;

    beforeEach(async () => {
      seedAuthorization(userPlain("owner"));
      TestBed.configureTestingModule({
        providers: [
          provideTestConfig(),
          provideRouter(routes),
          provideHttpClient(),
          provideHttpClientTesting(),
        ],
      });
      controller = TestBed.inject(HttpTestingController);
      harness = await RouterTestingHarness.create();
    });

    it("resolves the project and a node in the named right outlet", fakeAsync(() => {
      const router = TestBed.inject(Router);

      let done = false;
      harness
        .navigateByUrl(`/projects/${PROJECT_A_ID}/(right:nodes/node_two)`)
        .then(() => (done = true));
      tick();
      controller
        .expectOne(`/api/projects/${PROJECT_A_ID}`)
        .flush(projectAPlain());
      tick();
      harness.detectChanges();

      expect(done).toBeTrue();
      expect(router.url).toBe(
        `/projects/${PROJECT_A_ID}/(right:nodes/node_two)`,
      );
      expect(harness.routeNativeElement.querySelector("h1").textContent).toBe(
        "Project A",
      );
      expect(
        harness.routeNativeElement.querySelector("aside.node").textContent,
      ).toBe("Make JSON");
      controller.verify();
    }));

    it("routes /projects/import away from the project matcher", fakeAsync(() => {
      const router = TestBed.inject(Router);

      harness.navigateByUrl("/projects/import");
      tick();

      expect(router.url).toBe("/projects/import");
      controller.verify();
    }));

    it("keeps the user on the project until a pending edit is saved", fakeAsync(() => {
      const router = TestBed.inject(Router);
      harness.navigateByUrl(`/projects/${PROJECT_A_ID}`);
      tick();
      controller
        .expectOne(`/api/projects/${PROJECT_A_ID}`)
        .flush(projectAPlain());
      tick();
      const manager = TestBed.inject(ProjectManager);
      manager.project.pipeline.nodes.get("node_one").arrange.x = 500;

      harness.navigateByUrl("/elsewhere");
      tick();
      const whileSaving = router.url;
      controller
        .expectOne(PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_1"))
        .flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);

      expect(whileSaving).toBe(`/projects/${PROJECT_A_ID}`);
      expect(router.url).toBe("/elsewhere");
      expect(manager.project).toBeNull();
      controller.verify();
    }));
  });
});
