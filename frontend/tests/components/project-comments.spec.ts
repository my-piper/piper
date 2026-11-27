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
import {
  dialogButton,
  markedInvalid,
  openDialog,
  popupRoot,
} from "../helpers/taiga";

const COMMENTS_URL = `/api/projects/${PROJECT_A_ID}/comments`;

const COMMENT = {
  _id: "comment_one",
  project: PROJECT_A_ID,
  createdAt: "2026-01-02T00:00:00.000Z",
  createdBy: userPlain("owner"),
  message: "Looks good",
};

function setup(comments: object[] = []) {
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
    .flush(comments);
  tick(UI_DELAY);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;

  return {
    fixture,
    controller,
    element,
    message: () => element.querySelector("textarea"),
    cards: () => element.querySelectorAll(".card").length,
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

  describe("deleting", () => {
    /** Clicks the card's Delete and renders the confirmation. */
    function clickDelete(page: ReturnType<typeof setup>) {
      // the portal host for the dialog, only where a spec needs it
      const root = popupRoot();
      const render = () => {
        page.fixture.detectChanges();
        root.detectChanges();
        tick();
      };
      page.element
        .querySelector<HTMLButtonElement>(".card button.delete")
        .click();
      render();
      return render;
    }

    const commentUrl = `${COMMENTS_URL}/comment_one`;

    it("deletes a comment after the confirmation", fakeAsync(() => {
      const page = setup([COMMENT]);

      clickDelete(page);
      page.controller.expectNone(commentUrl);
      const question = openDialog().textContent;
      dialogButton("Delete").click();
      const request = page.controller.expectOne(commentUrl);
      request.flush(null);
      tick(UI_DELAY);
      page.fixture.detectChanges();

      expect(question).toContain("Delete comment?");
      expect(request.request.method).toBe("DELETE");
      expect(page.cards()).toBe(0);
      page.controller.verify();
      finish();
    }));

    it("keeps the comment when the deletion is cancelled", fakeAsync(() => {
      const page = setup([COMMENT]);

      const render = clickDelete(page);
      dialogButton("Cancel").click();
      render();

      page.controller.expectNone(commentUrl);
      expect(page.cards()).toBe(1);
      page.controller.verify();
      finish();
    }));
  });
});
