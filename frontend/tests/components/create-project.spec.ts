import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { CreateProjectComponent } from "src/app/projects/create/create-project.component";
import { UI_DELAY } from "src/consts/ui";
import { PROJECT_B_ID, projectBPlain, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import {
  configureAppTestingModule,
  finish,
  OutletStubComponent,
} from "../helpers/editor";

/**
 * Wire contract (backend/api/projects/add-project.ts):
 * POST /api/projects `{ title, pipeline, launchRequest }` → the new Project
 * without its graph; a title another Project has answers 409 with a text
 * message (packages/projects/titles.ts).
 */
const PROJECTS_URL = "/api/projects";
const TITLE_TAKEN = "A project with this title already exists";

function setup() {
  seedAuthorization(userPlain());
  configureAppTestingModule([
    { path: "", component: OutletStubComponent },
    {
      path: "projects",
      children: [
        { path: "new", component: CreateProjectComponent },
        { path: ":id", component: OutletStubComponent },
      ],
    },
  ]);
  const controller = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(AppComponent);
  router.navigateByUrl("/projects/new");
  tick();
  fixture.detectChanges();
  const element = fixture.debugElement.query(
    By.directive(CreateProjectComponent),
  ).nativeElement as HTMLElement;
  const input = element.querySelector<HTMLInputElement>(
    "[data-testid=project-title]",
  );
  const button = element.querySelector<HTMLButtonElement>(
    "[data-testid=create-project]",
  );

  return {
    controller,
    router,
    element,
    input,
    button,
    type: (title: string) => {
      input.value = title;
      input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new Event("blur"));
      fixture.detectChanges();
    },
    submit: () => {
      input.form.requestSubmit();
      fixture.detectChanges();
    },
    settle: () => {
      tick(UI_DELAY);
      fixture.detectChanges();
    },
    fieldError: () =>
      element
        .querySelector("[data-testid=project-title-error]")
        ?.textContent.trim(),
  };
}

describe("CreateProjectComponent", () => {
  it("starts with an empty title and Create disabled", fakeAsync(() => {
    const page = setup();

    expect(page.input.value).toBe("");
    expect(page.button.disabled).toBe(true);
    finish();
  }));

  for (const [label, title] of [
    ["blank", "      "],
    ["short", "Shrt"],
    ["long", "x".repeat(161)],
  ]) {
    it(`keeps Create disabled for a ${label} title`, fakeAsync(() => {
      const page = setup();

      page.type(title);

      expect(page.button.disabled).toBe(true);
      expect(page.fieldError()).toBe("Use 5 to 160 characters");
      finish();
    }));
  }

  it("creates the project with the trimmed title and opens it", fakeAsync(() => {
    const page = setup();
    page.type("  My new project ");

    page.submit();
    const request = page.controller.expectOne(PROJECTS_URL);
    request.flush(projectBPlain());
    page.settle();

    expect(request.request.method).toBe("POST");
    expect(request.request.body).toMatchObject({
      title: "My new project",
      pipeline: { name: "My new project", nodes: {}, flows: {} },
      launchRequest: { nodes: {}, inputs: {} },
    });
    expect(page.router.url).toBe(`/projects/${PROJECT_B_ID}`);
    page.controller.verify();
    finish();
  }));

  it("disables the form while the project is being created", fakeAsync(() => {
    const page = setup();
    page.type("My new project");

    page.submit();

    expect(page.input.disabled).toBe(true);
    expect(page.button.disabled).toBe(true);
    page.controller.expectOne(PROJECTS_URL).flush(projectBPlain());
    page.settle();
    finish();
  }));

  it("shows a taken title under the field and stays open", fakeAsync(() => {
    expectConsoleError("Process HTTP error 409");
    const page = setup();
    page.type("Demo project");

    page.submit();
    page.controller
      .expectOne(PROJECTS_URL)
      .flush(TITLE_TAKEN, { status: 409, statusText: "Conflict" });
    page.settle();

    expect(page.fieldError()).toBe(TITLE_TAKEN);
    expect(page.input.disabled).toBe(false);
    expect(page.button.disabled).toBe(true);
    expect(page.router.url).toBe("/projects/new");
    page.controller.verify();
    finish();
  }));

  it("lets another title be tried after a taken one", fakeAsync(() => {
    expectConsoleError("Process HTTP error 409");
    const page = setup();
    page.type("Demo project");
    page.submit();
    page.controller
      .expectOne(PROJECTS_URL)
      .flush(TITLE_TAKEN, { status: 409, statusText: "Conflict" });
    page.settle();

    page.type("Demo project 2");

    expect(page.fieldError()).toBeUndefined();
    expect(page.button.disabled).toBe(false);
    finish();
  }));

  it("shows any other failure above the form", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    const page = setup();
    page.type("Demo project");

    page.submit();
    page.controller
      .expectOne(PROJECTS_URL)
      .flush("You aren't logged", { status: 400, statusText: "Bad Request" });
    page.settle();

    expect(page.element.querySelector("[role=alert]").textContent).toContain(
      "You aren't logged",
    );
    expect(page.fieldError()).toBeUndefined();
    finish();
  }));
});
