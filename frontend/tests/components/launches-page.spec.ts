import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of } from "rxjs";
import { vi } from "vitest";
import { LaunchesPageComponent } from "src/app/launches-page/launches-page.component";
import { UI_DELAY } from "src/consts/ui";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

function setup() {
  seedAuthorization(userPlain("owner"));
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: { data: of({ filter: {} }) },
  });
  const fixture = TestBed.createComponent(LaunchesPageComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  controller
    .match((r) => r.url === "/api/launches")
    .forEach((r) => r.flush([]));
  tick(UI_DELAY);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const close = () =>
    element.querySelector<HTMLAnchorElement>(".modal header a");
  return { fixture, controller, element, close };
}

describe("LaunchesPageComponent", () => {
  it("closes the open launch outputs with Escape", fakeAsync(() => {
    const page = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), "navigate");
    page.fixture.componentInstance.modal = {} as never;
    page.fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(page.close().textContent).toContain("ESC");
    expect(navigate).toHaveBeenCalledWith(["./"], expect.anything());
    page.fixture.destroy();
    finish();
  }));
});
