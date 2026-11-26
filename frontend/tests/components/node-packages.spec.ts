import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { NodePackagesComponent } from "src/app/node-packages/node-packages.component";
import { EditPackageComponent } from "src/app/node-packages/edit/edit-package.component";
import { NodePackage } from "src/models/node-package";
import { UI_DELAY } from "src/consts/ui";
import { Plain, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import {
  configureAppTestingModule,
  finish,
  OutletStubComponent,
} from "../helpers/editor";
import { SocketDouble } from "../helpers/socket";
import { PACKAGES_ROOM } from "src/consts/rooms";

/**
 * Wire contracts (backend/api/node-packages, admin only):
 * - GET /api/node-packages → stored packages with nodeCount;
 * - GET /api/node-packages/updates/state, POST …/updates/check and
 *   POST …/updates/apply → `{ status: "checking" | "updating" | null,
 *   updates: [{ current, updated?, errors? }] }`
 *   (packages/node-packages/packages-update-state.ts);
 * - DELETE /api/node-packages/:_id → null.
 * Package updates are announced in the `packages` room as
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
      nodeCount: 3,
      readme: "Release **notes**",
      public: true,
    },
    {
      _id: "image_tools",
      title: "Image tools",
      description: "Image helpers",
      version: 1,
      nodeCount: 0,
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
function setup(initialUrl = "/packages") {
  seedAuthorization(userPlain("admin"));
  configureAppTestingModule([
    { path: "", component: OutletStubComponent },
    {
      path: "packages",
      component: NodePackagesComponent,
      children: [
        { path: "add", component: OutletStubComponent },
        { path: "import", component: OutletStubComponent },
      ],
    },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const socket = TestBed.inject(SocketDouble);
  const router = TestBed.inject(Router);

  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl(initialUrl);
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
    it("keeps counts after metadata edits and shows zero for a new package", fakeAsync(() => {
      const page = setup();
      page.load();
      const editor =
        TestBed.createComponent(EditPackageComponent).componentInstance;
      page.component().activate(editor);

      editor.saved.emit(
        new NodePackage({ ...packagesPlain()[0], nodeCount: undefined }),
      );
      editor.added.emit(new NodePackage({ _id: "empty", title: "Empty" }));
      tick();
      page.fixture.detectChanges();

      expect(
        Array.from(
          page.element.querySelectorAll("tbody tr td:nth-child(5)"),
        ).map((cell) => cell.textContent.trim()),
      ).toEqual(["0", "3", "0"]);
      page.controller.verify();
      finish();
    }));

    it("lists packages after a loading row and joins the updates room", fakeAsync(() => {
      const page = setup();

      const loading = page.element.querySelector("tr.loading");
      page.load();

      expect(loading).not.toBeNull();
      expect(page.element.querySelector("tr.loading")).toBeNull();
      expect(page.rows()).toEqual(["Text tools", "Image tools"]);
      expect(
        Array.from(
          page.element.querySelectorAll("tbody tr td:nth-child(5)"),
        ).map((cell) => cell.textContent.trim()),
      ).toEqual(["3", "0"]);
      expect(
        page.element.querySelectorAll(
          "a[href='/api/node-packages/text_tools/export']",
        ).length,
      ).toBe(1);
      expect(page.socket.emittedEvents("join_room")).toEqual([PACKAGES_ROOM]);
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

      expect(page.element.querySelector("[role=alert]").textContent).toContain(
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

      expect(page.socket.emittedEvents("leave_room")).toEqual([PACKAGES_ROOM]);
      expect(page.socket.listenerCount("package_updated")).toBe(0);
      finish();
    }));
  });

  describe("updates", () => {
    it("counts available updates and update errors", fakeAsync(() => {
      const page = setup();

      page.load();

      const badges = Array.from(
        page.checkButton().querySelectorAll("[tuiBadge]"),
      ).map((b) => [
        b.className.includes("update-errors"),
        b.textContent.trim(),
      ]);
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
      expect(page.checkButton().querySelector("[tuiBadge]").textContent).toBe(
        "1",
      );
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
      expect(page.checkButton().querySelector("[tuiBadge]")).toBeNull();
      page.controller.verify();
      finish();
    }));
  });

  describe("removing", () => {
    it("deletes a package through its menu and drops the row", fakeAsync(() => {
      const page = setup();
      page.load();

      (
        page.element.querySelector(
          "tbody tr button[tuiIconButton]",
        ) as HTMLElement
      ).click();
      page.fixture.detectChanges();
      const remove = Array.from(
        document.querySelectorAll("tui-data-list button"),
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
      expect(page.element.querySelector("[role=alert]").textContent).toContain(
        "Not found",
      );
      finish();
    }));
  });

  describe("modal", () => {
    it("shows routed content in a dialog and returns to packages on close", async () => {
      const page = fakeAsync(() => {
        const page = setup("/packages/add");
        page.load();
        finish();
        return page;
      })();
      const modal = () => document.querySelector("tui-dialog");

      page.fixture.detectChanges();
      await expect
        .poll(() => {
          page.fixture.detectChanges();
          return modal()?.textContent;
        })
        .toContain("outlet");
      expect(page.component().packages).toHaveLength(2);

      await page.router.navigateByUrl("/packages/import");
      page.fixture.detectChanges();

      expect(page.router.url).toBe("/packages/import");
      expect(modal()?.textContent).toContain("outlet");

      (modal().querySelector("button[tuiButtonX]") as HTMLElement).click();
      await expect
        .poll(() => {
          page.fixture.detectChanges();
          return page.router.url;
        })
        .toBe("/packages");
      await expect.poll(modal).toBeNull();
      page.controller.verify();
    });
  });
});
