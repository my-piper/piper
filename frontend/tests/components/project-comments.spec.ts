import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { ProjectCommentsComponent } from "src/app/project-comments/project-comments.component";
import { UI_DELAY } from "src/consts/ui";
import { projectA } from "../fixtures/models";
import { PROJECT_A_ID, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { markedInvalid } from "../helpers/taiga";

const COMMENTS_URL = `/api/projects/${PROJECT_A_ID}/comments`;

function setup() {
  seedAuthorization(userPlain("owner"));
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: { data: of({ project: projectA() }) },
  });
  const fixture = TestBed.createComponent(ProjectCommentsComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  controller
    .expectOne((r) => r.method === "GET" && r.url === COMMENTS_URL)
    .flush([]);
  tick(UI_DELAY);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;

  return {
    fixture,
    controller,
    element,
    message: () => element.querySelector("textarea"),
    add: () => {
      element.querySelector<HTMLButtonElement>("form button").click();
      fixture.detectChanges();
    },
  };
}

function type(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
  textarea.dispatchEvent(new Event("input"));
}

describe("ProjectCommentsComponent", () => {
  it("marks an empty message invalid and posts nothing", fakeAsync(() => {
    const page = setup();
    const before = markedInvalid(page.message());

    page.add();

    expect(before).toBe(false);
    expect(markedInvalid(page.message())).toBe(true);
    page.controller.expectNone((r) => r.method === "POST");
    page.controller.verify();
    finish();
  }));

  it("posts the message, shows the comment and empties the field", fakeAsync(() => {
    const page = setup();
    type(page.message(), "Looks good");

    page.add();
    const request = page.controller.expectOne(
      (r) => r.method === "POST" && r.url === COMMENTS_URL,
    );
    const body = request.request.body;
    request.flush({
      _id: "comment_one",
      project: PROJECT_A_ID,
      createdAt: "2026-01-02T00:00:00.000Z",
      createdBy: userPlain("owner"),
      message: "Looks good",
    });
    tick(UI_DELAY);
    page.fixture.detectChanges();

    expect(body).toEqual({ message: "Looks good" });
    expect(page.message().value).toBe("");
    expect(
      Array.from(page.element.querySelectorAll(".card .created-by")).map((c) =>
        c.textContent.trim(),
      ),
    ).toEqual(["user_owner"]);
    page.controller.verify();
    finish();
  }));
});
