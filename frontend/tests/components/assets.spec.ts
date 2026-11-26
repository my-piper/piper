import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { AssetsComponent } from "src/app/assets/assets.component";
import { UI_DELAY } from "src/consts/ui";
import { UserKind, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

const FOLDER_DEBOUNCE = 1000;

function setup(user: UserKind) {
  seedAuthorization(userPlain(user));
  configureAppTestingModule();
  const fixture = TestBed.createComponent(AssetsComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain(user)));
  controller.expectOne("/api/assets/folders").flush(["photos"]);
  controller.expectOne("/api/assets").flush([]);
  tick(UI_DELAY);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;

  return {
    fixture,
    controller,
    element,
    folder: () =>
      element.querySelector<HTMLInputElement>(
        'input[placeholder="Folder name"]',
      ),
  };
}

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

describe("AssetsComponent", () => {
  it("loads the assets of the typed folder", fakeAsync(() => {
    const page = setup("admin");

    type(page.folder(), "photos");
    tick(FOLDER_DEBOUNCE);
    const request = page.controller.expectOne(
      (r) => r.method === "GET" && r.url === "/api/assets",
    );
    request.flush([]);
    tick(UI_DELAY);

    expect(request.request.params.get("folder")).toBe("photos");
    page.controller.verify();
    finish();
  }));

  it("hides the folder field from non-admins", fakeAsync(() => {
    const page = setup("owner");

    expect(page.folder()).toBeNull();
    page.controller.verify();
    finish();
  }));
});
