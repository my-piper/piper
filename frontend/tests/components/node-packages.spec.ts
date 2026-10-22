import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { NodePackagesComponent } from "src/app/node-packages/node-packages.component";
import { UI_DELAY } from "src/ui-kit/consts";
import { Plain, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import {
  configureAppTestingModule,
  finish,
  OutletStubComponent,
} from "../helpers/editor";
import { SocketDouble } from "../helpers/socket";

/**
 * Wire contracts (backend/api/node-packages, admin only):
 * - GET /api/node-packages → stored packages;
 * - GET /api/node-packages/updates/state, POST …/updates/check and
 *   POST …/updates/apply → `{ status: "checking" | "updating" | null,
 *   updates: [{ current, updated?, errors? }] }`
 *   (packages/node-packages/packages-update-state.ts);
 * - DELETE /api/node-packages/:_id → null.
 * Package updates are announced in the `updating_packages` room as
 * `package_updated` (packages/node-packages/update-package.ts).
 */
const PACKAGES_URL = "/api/node-packages";
const STATE_URL = "/api/node-packages/updates/state";
const CHECK_URL = "/api/node-packages/updates/check";
const APPLY_URL = "/api/node-packages/updates/apply";
/** Delay between update-state polls while checking or updating. */
const POLL_DELAY = 2000;

function packagesPlain(): Plain[] {
  return [
    {
      _id: "text_tools",
      title: "Text tools",
      description: "Text helpers",
      version: 2,
      readme: "Release **notes**",
      public: true,
    },
    {
      _id: "image_tools",
      title: "Image tools",
      description: "Image helpers",
      version: 1,
    },
  ];
}

function updatesStatePlain(status: string | null = null): Plain {
  return {
    status,
    updates: [
      {
        current: packagesPlain()[0],
        updated: { ...packagesPlain()[0], version: 3 },
      },
      { current: packagesPlain()[1], errors: "Can't fetch package" },
    ],
  };
}

/** Renders the admin packages page inside the real app root. Call in `fakeAsync`. */
function setup() {
  seedAuthorization(userPlain("admin"));
  configureAppTestingModule([
    { path: "", component: OutletStubComponent },
    {
      path: "packages",
      component: NodePackagesComponent,
      children: [{ path: "add", component: OutletStubComponent }],
    },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const socket = TestBed.inject(SocketDouble);
  const router = TestBed.inject(Router);

  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl("/packages");
  tick();
  fixture.detectChanges();

  const element = fixture.debugElement.query(
    By.directive(NodePackagesComponent),
  ).nativeElement as HTMLElement;
  const settle = () => {
    tick(UI_DELAY);
    fixture.detectChanges();
  };

  return {
    fixture,
    element,
    controller,
    socket,
    router,
    settle,
    component: () =>
      fixture.debugElement.query(By.directive(NodePackagesComponent))
        ?.componentInstance as NodePackagesComponent,
    rows: () =>
      Array.from(element.querySelectorAll("tbody tr:not(.loading)")).map((tr) =>
        tr.querySelector("td:nth-child(2)").textContent.trim(),
      ),
    checkButton: () =>
      element.querySelector(".app-container > header button") as HTMLElement,
    /** Answers the two initial requests. */
    load: (state = updatesStatePlain(), packages = packagesPlain()) => {
      controller.expectOne(PACKAGES_URL).flush(packages);
      controller.expectOne(STATE_URL).flush(state);
      tick(UI_DELAY);
      fixture.detectChanges();
    },
  };
}

describe("NodePackagesComponent", () => {
  describe("loading", () => {
    it("lists packages after a loading row and joins the updates room", fakeAsync(() => {
      const page = setup();

      const loading = page.element.querySelector("tr.loading");
      page.load();

      expect(loading).not.toBeNull();
      expect(page.element.querySelector("tr.loading")).toBeNull();
      expect(page.rows()).toEqual(["Text tools", "Image tools"]);
      expect(
        page.element.querySelectorAll(
          "a[href='/api/node-packages/text_tools/export']",
        ).length,
      ).toBe(1);
      expect(page.socket.emittedEvents("join_room")).toEqual([
        "updating_packages",
      ]);
      page.controller.verify();
      finish();
    }));

    it("shows a failed load", fakeAsync(() => {
      expectConsoleError("Process HTTP error 403");
      const page = setup();

      page.controller
        .expectOne(PACKAGES_URL)
        .flush("Forbidden", { status: 403, statusText: "Forbidden" });
      page.controller.expectOne(STATE_URL).flush(updatesStatePlain());
      page.settle();

      expect(page.element.querySelector("app-informer").textContent).toContain(
        "Forbidden",
      );
      expect(page.rows()).toEqual([]);
      finish();
    }));

    it("reloads the list when a package update is announced", fakeAsync(() => {
      const page = setup();
      page.load();

      page.socket.receive("package_updated", { package: "text_tools" });
      page.controller
        .expectOne(PACKAGES_URL)
        .flush([{ ...packagesPlain()[0], title: "Text tools v3" }]);
      page.settle();

      expect(page.rows()).toEqual(["Text tools v3"]);
      page.controller.verify();
      finish();
    }));

    it("leaves the updates room and stops listening when closed", fakeAsync(() => {
      const page = setup();
      page.load();

      page.router.navigateByUrl("/");
      tick();
      page.fixture.detectChanges();

      expect(page.socket.emittedEvents("leave_room")).toEqual([
        "updating_packages",
      ]);
      expect(page.socket.listenerCount("package_updated")).toBe(0);
      finish();
    }));
  });

  describe("updates", () => {
    it("counts available updates and update errors", fakeAsync(() => {
      const page = setup();

      page.load();

      const badges = Array.from(
        page.checkButton().querySelectorAll(".badge"),
      ).map((b) => [b.className.includes("error"), b.textContent.trim()]);
      expect(badges).toEqual([
        [false, "1"],
        [true, "1"],
      ]);
      finish();
    }));

    it("polls the update state while a check is running", fakeAsync(() => {
      const page = setup();
      page.load(updatesStatePlain("checking"));
      const busy = page.checkButton().textContent.trim();

      tick(POLL_DELAY);
      page.controller.expectOne(STATE_URL).flush(updatesStatePlain());
      page.settle();
      tick(POLL_DELAY);

      expect(busy).toBe("Checking");
      expect(page.checkButton().textContent).toContain("Check updates");
      page.controller.verify();
      finish();
    }));

    it("starts a check and follows its state", fakeAsync(() => {
      const page = setup();
      page.load({ status: null, updates: [] });

      page.checkButton().click();
      page.fixture.detectChanges();
      const request = page.controller.expectOne(CHECK_URL);
      request.flush(updatesStatePlain("checking"));
      page.settle();
      const status = page.checkButton().textContent.trim();
      tick(POLL_DELAY);
      page.controller.expectOne(STATE_URL).flush(updatesStatePlain());
      page.settle();

      expect(request.request.method).toBe("POST");
      expect(status).toBe("Checking");
      expect(page.checkButton().querySelector(".badge").textContent).toBe("1");
      page.controller.verify();
      finish();
    }));

    it("applies updates and follows their state", fakeAsync(() => {
      const page = setup();
      page.load();

      page.component().update();
      const request = page.controller.expectOne(APPLY_URL);
      request.flush(updatesStatePlain("updating"));
      page.settle();
      const status = page.checkButton().textContent.trim();
      tick(POLL_DELAY);
      page.controller.expectOne(STATE_URL).flush({ status: null, updates: [] });
      page.settle();

      expect(request.request.method).toBe("POST");
      expect(status).toBe("Updating");
      expect(page.checkButton().querySelector(".badge")).toBeNull();
      page.controller.verify();
      finish();
    }));
  });

  describe("removing", () => {
    it("deletes a package through its menu and drops the row", fakeAsync(() => {
      const page = setup();
      page.load();

      (
        page.element.querySelector("tbody tr button.circle") as HTMLElement
      ).click();
      page.fixture.detectChanges();
      const remove = Array.from(
        document.querySelectorAll(".context-menu button"),
      ).find((b) => b.textContent.includes("Delete")) as HTMLElement;
      remove.click();
      const request = page.controller.expectOne(`${PACKAGES_URL}/text_tools`);
      request.flush(null);
      page.settle();

      expect(request.request.method).toBe("DELETE");
      expect(page.rows()).toEqual(["Image tools"]);
      page.controller.verify();
      finish();
    }));

    it("keeps the row when deleting fails", fakeAsync(() => {
      expectConsoleError("Process HTTP error 404");
      const page = setup();
      page.load();

      page.component().remove(1, page.component().packages[1]);
      page.controller
        .expectOne(`${PACKAGES_URL}/image_tools`)
        .flush("Not found", { status: 404, statusText: "Not Found" });
      page.settle();

      expect(page.rows()).toEqual(["Text tools", "Image tools"]);
      expect(page.element.querySelector("app-informer").textContent).toContain(
        "Not found",
      );
      finish();
    }));
  });

  describe("modal", () => {
    it("shows the modal only while a child route is open", fakeAsync(() => {
      const page = setup();
      page.load();
      const modal = () =>
        page.element.querySelector("div.modal") as HTMLElement;
      const hiddenBefore = modal().classList.contains("hidden");

      page.router.navigateByUrl("/packages/add");
      tick();
      page.fixture.detectChanges();
      const hiddenOpen = modal().classList.contains("hidden");
      page.router.navigateByUrl("/packages");
      tick();
      page.fixture.detectChanges();

      expect(hiddenBefore).toBeTrue();
      expect(hiddenOpen).toBeFalse();
      expect(modal().classList).toContain("hidden");
      finish();
    }));
  });
});
