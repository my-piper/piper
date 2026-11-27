import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { LaunchesPageComponent } from "src/app/launches-page/launches-page.component";
import { UI_DELAY } from "src/consts/ui";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import {
  configureAppTestingModule,
  finish,
  OutletStubComponent,
} from "../helpers/editor";

/**
 * Renders the launches page in a real router, with a stub for the launch
 * outputs child route. Call in `fakeAsync`.
 */
function setup(url: string) {
  seedAuthorization(userPlain("owner"));
  configureAppTestingModule([
    {
      path: "launches",
      component: LaunchesPageComponent,
      data: { filter: {} },
      children: [
        {
          path: "outputs/:id",
          component: OutletStubComponent,
          data: { dialogLabel: "Launch outputs" },
        },
      ],
    },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl(url);
  tick();
  fixture.detectChanges();
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  controller
    .match((r) => r.url === "/api/launches")
    .forEach((r) => r.flush([]));
  tick(UI_DELAY);
  fixture.detectChanges();
  return { fixture, controller, router };
}

describe("LaunchesPageComponent", () => {
  it("shows launch outputs in a dialog and returns to the launches on close", async () => {
    const page = fakeAsync(() => {
      const page = setup("/launches/outputs/launch_1");
      finish();
      return page;
    })();
    const dialog = () => document.querySelector("tui-dialog");

    await expect
      .poll(() => {
        page.fixture.detectChanges();
        return dialog()?.textContent;
      })
      .toContain("outlet");
    expect(dialog().querySelector("header h2").textContent.trim()).toBe(
      "Launch outputs",
    );

    dialog().querySelector<HTMLElement>("button[tuiButtonX]").click();

    await expect
      .poll(() => {
        page.fixture.detectChanges();
        return page.router.url;
      })
      .toBe("/launches");
    await expect.poll(dialog).toBeNull();
  });
});
