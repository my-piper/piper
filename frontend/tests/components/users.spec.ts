import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { UsersComponent } from "src/app/users/users.component";
import { UI_DELAY } from "src/consts/ui";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { iconName } from "../helpers/taiga";
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
    Array.from(element.querySelectorAll("tbody tr td:nth-child(2)")).map((td) =>
      td.textContent.trim(),
    );
  return { fixture, controller, element, logins };
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
});
