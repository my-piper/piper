import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { vi } from "vitest";
import { PlayViaApiComponent } from "src/app/play-via-api/play-via-api.component";
import { UI_DELAY } from "src/consts/ui";
import { Deploy } from "src/models/deploy";
import { toInstance } from "src/utils/models";
import { smallGraphPipeline, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

/** POST /api/me/api-token/generate answers with a new Authorization. */
const GENERATE_URL = "/api/me/api-token/generate";

function setup() {
  seedAuthorization(userPlain("owner"));
  const deploy = toInstance(
    {
      _id: "demo",
      slug: "demo",
      pipeline: smallGraphPipeline(),
      launchRequest: { inputs: { topic: "Cats" } },
    },
    Deploy,
  );
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: { data: of({ deploy }) },
  });
  const fixture = TestBed.createComponent(PlayViaApiComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  const element: HTMLElement = fixture.nativeElement;
  const generate = () =>
    Array.from(element.querySelectorAll("button")).find((b) =>
      b.textContent.includes("Generate API key"),
    );
  return { fixture, controller, element, generate };
}

describe("PlayViaApiComponent", () => {
  it("generates an API token after confirmation and shows it", fakeAsync(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const page = setup();

    page.generate().click();
    page.controller
      .expectOne(GENERATE_URL)
      .flush({ token: "api-token-1", user: userPlain("owner") });
    tick(UI_DELAY);
    page.fixture.detectChanges();

    expect(page.element.querySelector("textarea").value).toBe("api-token-1");
    expect(page.generate()).toBeUndefined();
    page.controller.verify();
    finish();
  }));

  it("keeps the current token when the confirmation is declined", fakeAsync(() => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const page = setup();

    page.generate().click();

    page.controller.expectNone(GENERATE_URL);
    expect(page.generate()).toBeDefined();
    page.controller.verify();
    finish();
  }));
});
