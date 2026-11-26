import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { AssistantComponent } from "src/app/assistant/assistant.component";
import { projectA } from "../fixtures/models";
import { PROJECT_A_ID, userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

const CHAT_URL = `/api/projects/${PROJECT_A_ID}/assistant/chat`;
const ASSIST_URL = `/api/projects/${PROJECT_A_ID}/assist`;
// The component puts the question into the chat after this pause.
const ECHO_DELAY = 100;

function setup() {
  seedAuthorization(userPlain("owner"));
  configureAppTestingModule();
  const route = {
    data: of({ project: projectA() }),
    snapshot: { data: {} },
    children: [] as unknown[],
  };
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: { ...route, root: route },
  });
  const fixture = TestBed.createComponent(AssistantComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
  controller.expectOne(CHAT_URL).flush([]);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;

  return {
    fixture,
    controller,
    element,
    question: () => element.querySelector("textarea"),
    senders: () =>
      Array.from(element.querySelectorAll(".message")).map((m) =>
        m.getAttribute("data-from"),
      ),
  };
}

function type(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
  textarea.dispatchEvent(new Event("input"));
}

describe("AssistantComponent", () => {
  it("sends the question on Enter and shows both sides of the chat", fakeAsync(() => {
    const page = setup();
    type(page.question(), "Add a node");

    page
      .question()
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    const request = page.controller.expectOne(
      (r) => r.method === "POST" && r.url === ASSIST_URL,
    );
    const body = request.request.body;
    tick(ECHO_DELAY);
    page.fixture.detectChanges();
    const cleared = page.question().value;
    request.flush({ from: "assistant", message: "Done" });
    page.fixture.detectChanges();

    expect(body).toEqual({ question: "Add a node" });
    expect(cleared).toBe("");
    expect(page.question().disabled).toBe(false);
    expect(page.senders()).toEqual(["user", "assistant"]);
    page.controller.verify();
    finish();
  }));
});
