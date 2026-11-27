import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { UsersComponent } from "src/app/users/users.component";
import { UI_DELAY } from "src/consts/ui";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import {
  dialogButton,
  iconName,
  openDialog,
  popupRoot,
} from "../helpers/taiga";
import { configureAppTestingModule, finish } from "../helpers/editor";

/** GET /api/users lists users (backend/api/users). */
function setup(users = [userPlain("owner"), userPlain("engineer")]) {
  seedAuthorization(userPlain("admin"));
  configureAppTestingModule([{ path: "users", children: [] }]);
  const fixture = TestBed.createComponent(UsersComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("admin")));
  controller
    .expectOne((r) => r.method === "GET" && r.url === "/api/users")
    .flush(users);
  tick(UI_DELAY);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const logins = () =>
    Array.from(element.querySelectorAll("tbody tr td:nth-child(1)")).map((td) =>
      td.textContent.trim(),
    );
  return { fixture, controller, element, logins };
}

/**
 * Clicks the first row's Delete and renders the confirmation. Returns a
 * function that renders the page and the dialog again.
 */
function clickDelete(page: ReturnType<typeof setup>) {
  // the portal host for the dialog, only where a spec needs it
  const root = popupRoot();
  const render = () => {
    page.fixture.detectChanges();
    root.detectChanges();
    tick();
  };
  page.element
    .querySelector<HTMLButtonElement>("tbody tr button.delete")
    .click();
  render();
  return render;
}

describe("UsersComponent", () => {
  it("lists users and links Create to the add form", fakeAsync(() => {
    const page = setup();

    const create = Array.from(
      page.element.querySelectorAll<HTMLAnchorElement>(
        ".app-container header a",
      ),
    ).find((a) => a.textContent.includes("Create"));

    expect(page.logins()).toEqual(["user_owner", "user_engineer"]);
    expect(create.getAttribute("href")).toMatch(/\/add$/);
    page.controller.verify();
    finish();
  }));

  it("marks a user who signed up with Google by the multicolor logo", fakeAsync(() => {
    const page = setup([{ ...userPlain("owner"), provider: "google" }]);

    const icon = page.element.querySelector("tbody tui-icon");
    const logo = getComputedStyle(icon, "::before");

    // Taiga draws "@img." icons as images, keeping the logo's colors (its
    // 20px comes from src/styles/icons.scss, which unit tests do not load)
    expect(iconName(icon)).toBe("img");
    expect(logo.backgroundImage).toContain("data:image/svg+xml");
    expect(logo.maskImage).toBe("none");
    page.controller.verify();
    finish();
  }));

  it("deletes a user after the confirmation", fakeAsync(() => {
    const page = setup();

    clickDelete(page);
    page.controller.expectNone("/api/users/user_owner");
    const question = openDialog().textContent;
    dialogButton("Delete").click();
    const request = page.controller.expectOne("/api/users/user_owner");
    request.flush(null);
    tick(UI_DELAY);
    page.fixture.detectChanges();

    expect(question).toContain("Delete user?");
    expect(question).toContain("«user_owner» will be deleted");
    expect(request.request.method).toBe("DELETE");
    expect(page.logins()).toEqual(["user_engineer"]);
    page.controller.verify();
    finish();
  }));

  it("keeps the user when the deletion is cancelled", fakeAsync(() => {
    const page = setup();

    const render = clickDelete(page);
    dialogButton("Cancel").click();
    render();

    page.controller.expectNone("/api/users/user_owner");
    expect(page.logins()).toEqual(["user_owner", "user_engineer"]);
    page.controller.verify();
    finish();
  }));
});
