import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  discardPeriodicTasks,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from "@angular/core/testing";
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from "@angular/router";
import { ProjectComponent } from "src/app/project/project.component";
import { AnonymousGuard } from "src/guards/anonymous.guard";
import { ShouldCheckReadmeGuard } from "src/guards/pipeline-readme";
import { SaveProjectGuard } from "src/guards/save-project.guard";
import { SigninNeededGuard } from "src/guards/signin.guard";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { projectA } from "../../fixtures/models";
import {
  PATCH_PROJECT_URL,
  patchResponsePlain,
  PROJECT_A_ID,
  revisionConflict,
  userPlain,
} from "../../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../../helpers/config";

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideTestConfig(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return {
    router: TestBed.inject(Router),
    controller: TestBed.inject(HttpTestingController),
  };
}

function snapshot(params: Record<string, string>) {
  return { params } as unknown as ActivatedRouteSnapshot;
}

describe("route guards", () => {
  describe("AnonymousGuard", () => {
    it("lets anonymous users through", () => {
      setup();

      const result = TestBed.inject(AnonymousGuard).canActivate();

      expect(result).toBeTrue();
    });

    it("redirects signed-in users home", () => {
      seedAuthorization(userPlain("owner"));
      const { router } = setup();

      const result = TestBed.inject(AnonymousGuard).canActivate();

      expect(router.serializeUrl(result as UrlTree)).toBe("/");
    });
  });

  describe("SigninNeededGuard", () => {
    it("lets signed-in users through", () => {
      seedAuthorization(userPlain("owner"));
      setup();

      const result = TestBed.inject(SigninNeededGuard).canActivate();

      expect(result).toBeTrue();
    });

    it("redirects anonymous users to login", () => {
      const { router } = setup();

      const result = TestBed.inject(SigninNeededGuard).canActivate();

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe("/login");
    });
  });

  describe("ShouldCheckReadmeGuard", () => {
    it("shows the readme once per project, then lets the user through", () => {
      const { router } = setup();
      const guard = TestBed.inject(ShouldCheckReadmeGuard);
      const state = {} as RouterStateSnapshot;

      const first = guard.canActivate(snapshot({ id: "p1" }), state);
      const second = guard.canActivate(snapshot({ id: "p1" }), state);
      const other = guard.canActivate(snapshot({ id: "p2" }), state);

      expect(router.serializeUrl(first as UrlTree)).toBe("/play/p1/readme");
      expect(second).toBeTrue();
      expect(other).toBeInstanceOf(UrlTree);
    });
  });

  describe("SaveProjectGuard", () => {
    const component = {} as ProjectComponent;

    function prepare() {
      const { controller } = setup();
      const manager = TestBed.inject(ProjectManager);
      const project = projectA();
      manager.project = project;
      const guard = TestBed.inject(SaveProjectGuard);
      return { controller, manager, project, guard };
    }

    function decide(guard: SaveProjectGuard) {
      const decisions: boolean[] = [];
      const subscription = guard
        .canDeactivate(component)
        .subscribe((d) => decisions.push(d));
      return { decisions, subscription };
    }

    it("permits navigation immediately when nothing changed", fakeAsync(() => {
      const { controller, manager, guard } = prepare();

      const { decisions } = decide(guard);

      expect(decisions).toEqual([true]);
      expect(manager.project).toBeNull();
      controller.verify();
    }));

    it("saves pending edits and permits navigation only after success", fakeAsync(() => {
      const { controller, manager, project, guard } = prepare();
      project.pipeline.nodes.get("node_one").arrange.x = 777;

      const { decisions } = decide(guard);
      const req = controller.expectOne(
        PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_1"),
      );
      const beforeResponse = [...decisions];
      req.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);

      expect(req.request.method).toBe("PATCH");
      expect(req.request.body.pipeline).toBeDefined();
      expect(beforeResponse).toEqual([]);
      expect(decisions).toEqual([true]);
      expect(project.revision).toBe("rev_a_2");
      expect(manager.project).toBeNull();
      controller.verify();
    }));

    it("blocks navigation and keeps the project when saving fails, then retries", fakeAsync(() => {
      spyOn(console, "error");
      const { controller, manager, project, guard } = prepare();
      project.pipeline.nodes.get("node_one").arrange.x = 777;
      const conflict = revisionConflict();

      const first = decide(guard);
      controller
        .expectOne(PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_1"))
        .flush(conflict.body, conflict);
      tick(UI_DELAY);
      const afterFailure = [...first.decisions];
      const status = manager.status.value;
      first.subscription.unsubscribe();
      const retry = decide(guard);
      controller
        .expectOne(PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_1"))
        .flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);

      expect(afterFailure).toEqual([]);
      expect(status).toBe("error");
      expect(manager.error.value.message).toContain("more fresh version");
      expect(retry.decisions).toEqual([true]);
      expect(manager.project).toBeNull();
      controller.verify();
    }));

    it("saves edits made while an autosave is in flight before navigating", fakeAsync(() => {
      const { controller, manager, project, guard } = prepare();
      project.pipeline.nodes.get("node_one").arrange.x = 100;
      manager.kick();
      const inFlight = controller.expectOne(
        PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_1"),
      );
      project.pipeline.nodes.get("node_one").arrange.x = 200;

      const { decisions } = decide(guard);
      inFlight.flush(patchResponsePlain("rev_a_2"));
      tick(UI_DELAY);
      const followUp = controller.match(
        PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_2"),
      );
      followUp.forEach((r) => r.flush(patchResponsePlain("rev_a_3")));
      tick(UI_DELAY);

      expect(followUp.length).toBe(1);
      expect(decisions).toEqual([true]);
      controller.verify();
      flush();
      discardPeriodicTasks();
    }));
  });
});
