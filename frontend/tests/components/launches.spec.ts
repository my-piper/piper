import {
  HttpTestingController,
  TestRequest,
} from "@angular/common/http/testing";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { LaunchesComponent } from "src/app/launches/launches.component";
import { Launch, LaunchesFilter, StringData } from "src/models/launch";
import { PipelineLaunchedSignal } from "src/models/signals/launch";
import { LiveService } from "src/services/live.service";
import { SignalsService } from "src/services/signals.service";
import { toInstance } from "src/utils/models";
import { launchResponsePlain } from "../fixtures/launch-results";
import {
  LAUNCH_ID,
  launchPlain,
  PROJECT_A_ID,
  setErrorsEventPlain,
  setOutputEventPlain,
  USER_IDS,
  userPlain,
} from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import {
  configureAppTestingModule,
  finish as flushAll,
} from "../helpers/editor";
import { hover, unhover } from "../helpers/taiga";
import { SocketDouble } from "../helpers/socket";
import { LAUNCH_ROOM, USER_ROOM } from "src/consts/rooms";

/**
 * GET /api/launches?project=… lists launches (backend/api/launches/list.ts);
 * `set_inputs`, `set_output` and `set_errors` arrive in the launching user's
 * room (backend/jobs/set-launch-*.ts). Cards also read
 * /api/launches/:id/metrics/finished and /api/launches/:id/heartbeat.
 */
const UI_DELAY = 250;

/** A listed launch whose `result` output has no data yet. */
function listedLaunch(_id = LAUNCH_ID) {
  return {
    ...launchPlain(),
    _id,
    launchedBy: { _id: USER_IDS.owner },
    outputs: { result: { _id: "result", title: "Result", type: "json" } },
  };
}

describe("LaunchesComponent", () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: LaunchesComponent;
  let controller: HttpTestingController;
  let socket: SocketDouble;
  let element: HTMLElement;

  /** Answers per-card metric/heartbeat reads; returns other pending requests. */
  function answerCards(): TestRequest[] {
    const cards = controller.match(
      (r) =>
        r.url.endsWith("/metrics/finished") || r.url.endsWith("/heartbeat"),
    );
    cards.forEach((r) => r.flush(null));
    return cards;
  }

  /** Renders the launches inside the real app root, where Taiga popups live. */
  function setup(launches: object[] = [listedLaunch()]) {
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule([
      { path: "launches", component: LaunchesComponent },
    ]);
    controller = TestBed.inject(HttpTestingController);
    socket = TestBed.inject(SocketDouble);
    fixture = TestBed.createComponent(AppComponent);
    TestBed.inject(Router).navigateByUrl("/launches");
    tick();
    fixture.detectChanges();
    const debug = fixture.debugElement.query(By.directive(LaunchesComponent));
    component = debug.componentInstance as LaunchesComponent;
    element = debug.nativeElement as HTMLElement;
    component.filter = new LaunchesFilter({ project: PROJECT_A_ID });
    fixture.detectChanges();
    controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
    const list = controller.expectOne((r) => r.url === "/api/launches");
    list.flush(launches);
    tick(UI_DELAY);
    fixture.detectChanges();
    answerCards();
    return list;
  }

  afterEach(() => controller.verify());

  /** Card pipes poll while rendered; destroying stops them before flushing. */
  function finish() {
    if (!fixture.componentRef.hostView.destroyed) {
      fixture.destroy();
    }
    flushAll();
  }

  it("lists launches for the project filter", fakeAsync(() => {
    const list = setup();

    expect(list.request.params.get("project")).toBe(PROJECT_A_ID);
    expect(element.querySelectorAll(".card").length).toBe(1);
    expect(component.launches[0]).toBeInstanceOf(Launch);
    finish();
  }));

  it("shows the empty state when there are no launches", fakeAsync(() => {
    setup([]);

    expect(element.querySelectorAll(".card").length).toBe(0);
    expect(element.textContent).toContain("Launches not found");
    finish();
  }));

  it("fills an output of a listed launch from set_output", fakeAsync(() => {
    setup();

    socket.receive("set_output", setOutputEventPlain("launch_other"));
    const before = component.launches[0].outputs.get("result").data;
    socket.receive("set_output", setOutputEventPlain());
    fixture.detectChanges();
    answerCards();

    const output = component.launches[0].outputs.get("result");
    expect(before).toBeUndefined();
    expect(output.data).toEqual(
      expect.objectContaining({ value: { answer: 42 } }),
    );
    expect(
      JSON.parse(element.querySelector(".results pre").textContent),
    ).toEqual({ answer: 42 });
    finish();
  }));

  it("adds an output the listed launch did not know yet", fakeAsync(() => {
    setup();
    const event = setOutputEventPlain() as {
      id: string;
      output: Record<string, unknown>;
    };
    event.id = "summary";
    event.output = {
      _id: "summary",
      title: "Summary",
      type: "string",
      data: { type: "string", value: "Done", length: 4 },
    };

    socket.receive("set_output", event);
    fixture.detectChanges();
    answerCards();

    const output = component.launches[0].outputs.get("summary");
    expect(output?.data).toBeInstanceOf(StringData);
    expect((output.data as StringData).value).toBe("Done");
    finish();
  }));

  it("shows launch errors from set_errors for its launch only", fakeAsync(() => {
    setup();

    socket.receive("set_errors", setErrorsEventPlain("launch_other"));
    const before = element.querySelector(
      "[data-testid=launch-status][data-state=failed]",
    );
    socket.receive("set_errors", setErrorsEventPlain());
    fixture.detectChanges();
    answerCards();

    const button = element.querySelector<HTMLElement>(
      "[data-testid=launch-status][data-state=failed]",
    );
    button.scrollIntoView();
    hover(button);
    tick(1000);
    fixture.detectChanges();
    const hint = document.querySelector("tui-hint")?.textContent;
    unhover(button);
    tick(1000);
    fixture.detectChanges();

    expect(before).toBeNull();
    expect(component.launches[0].errors).toEqual(["node_two: failed"]);
    expect(hint).toContain("node_two: failed");
    finish();
  }));

  it("prepends a launch announced by the playground", fakeAsync(() => {
    setup();

    TestBed.inject(SignalsService).emit(
      new PipelineLaunchedSignal(
        toInstance(launchResponsePlain("launch_new"), Launch),
      ),
    );
    fixture.detectChanges();
    answerCards();

    expect(component.launches.map((l) => l._id)).toEqual([
      "launch_new",
      LAUNCH_ID,
    ]);
    finish();
  }));

  function chooseFromMenu(card: number, label: string) {
    const cards = element.querySelectorAll(".card");
    cards[card]
      .querySelector<HTMLButtonElement>("button[aria-label=Actions]")
      .click();
    fixture.detectChanges();
    Array.from(
      document.querySelectorAll<HTMLElement>("tui-data-list [tuiOption]"),
    )
      .find((option) => option.textContent.includes(label))
      .click();
  }

  it("removes a launch through its card menu after the server confirms", fakeAsync(() => {
    setup([listedLaunch(), listedLaunch("launch_two")]);

    chooseFromMenu(0, "Delete");
    const request = controller.expectOne(`/api/launches/${LAUNCH_ID}`);
    request.flush(null);
    tick(UI_DELAY);
    fixture.detectChanges();
    answerCards();

    expect(request.request.method).toBe("DELETE");
    expect(component.launches.map((l) => l._id)).toEqual(["launch_two"]);
    expect(component.progress.removing[0]).toBe(false);
    // a closed dropdown stays in the DOM until its leave animation ends
    expect(document.querySelector("tui-dropdown:not(.tui-leave)")).toBeNull();
    finish();
  }));

  it("stops reacting and releases its rooms when destroyed", fakeAsync(() => {
    setup();
    const live = TestBed.inject(LiveService);

    fixture.destroy();
    TestBed.inject(SignalsService).emit(
      new PipelineLaunchedSignal(
        toInstance(launchResponsePlain("late"), Launch),
      ),
    );

    expect(component.launches.map((l) => l._id)).toEqual([LAUNCH_ID]);
    expect(socket.listenerCount()).toBe(0);
    expect(live.rooms.get(USER_ROOM(USER_IDS.owner)).size).toBe(1);
    expect(live.rooms.has(LAUNCH_ROOM(LAUNCH_ID))).toBe(false);
    finish();
  }));
  describe("as cards", () => {
    const IMAGE = {
      type: "image",
      format: "png",
      url: "https://cdn.test/a.png",
      width: 640,
      height: 480,
    };

    function withOutputs(_id: string, outputs: object) {
      return { ...listedLaunch(_id), outputs };
    }

    function cards() {
      return Array.from(
        element.querySelectorAll<HTMLElement>(
          "[data-testid=launches-cards] .card",
        ),
      );
    }

    function states() {
      return cards().map(
        (card) =>
          card.querySelector<HTMLElement>("[data-testid=launch-status]")
            .dataset["state"],
      );
    }

    it("previews each launch's image, video, image array or text output", fakeAsync(() => {
      seedCards([
        withOutputs("l_image", {
          image: { _id: "image", title: "Image", type: "image", data: IMAGE },
        }),
        withOutputs("l_video", {
          video: {
            _id: "video",
            title: "Video",
            type: "video",
            data: {
              type: "video",
              format: "mp4",
              url: "https://cdn.test/v.mp4",
              poster: "https://cdn.test/v.jpg",
              width: 1280,
              height: 720,
            },
          },
        }),
        withOutputs("l_images", {
          images: {
            _id: "images",
            title: "Images",
            type: "image[]",
            data: { type: "image[]", images: [IMAGE, IMAGE, IMAGE], count: 3 },
          },
        }),
        withOutputs("l_text", {
          text: {
            _id: "text",
            title: "Caption",
            type: "string",
            data: { type: "string", value: "A heron at dusk", length: 15 },
          },
        }),
      ]);

      const [image, video, images, text] = cards();

      expect(
        image.querySelector(".results[data-type=image] img"),
      ).not.toBeNull();
      expect(image.querySelector("app-launch-outputs footer")).toBeNull();
      expect(video.querySelector("[data-testid=video-badge]")).not.toBeNull();
      expect(video.querySelector(".results img")).not.toBeNull();
      expect(video.querySelector(".results video")).toBeNull();
      expect(
        images.querySelector("[data-testid=images-count]").textContent,
      ).toMatch(/1\s*\/\s*3/);
      expect(
        images.querySelectorAll("app-launch-outputs footer button").length,
      ).toBe(3);
      expect(text.querySelector(".kind").textContent).toBe("string");
      expect(text.querySelector(".results").textContent).toContain(
        "A heron at dusk",
      );
      finish();
    }));

    it("previews the first output that fills, even after the first render", fakeAsync(() => {
      seedCards([
        withOutputs(LAUNCH_ID, {
          caption: { _id: "caption", title: "Caption", type: "string" },
          image: { _id: "image", title: "Image", type: "image" },
        }),
      ]);
      const before = cards()[0].querySelector("[data-testid=no-outputs]");

      socket.receive("set_output", {
        launch: LAUNCH_ID,
        id: "image",
        output: { _id: "image", title: "Image", type: "image", data: IMAGE },
      });
      fixture.detectChanges();

      expect(before).not.toBeNull();
      expect(
        cards()[0].querySelector(".results")?.getAttribute("data-type"),
      ).toBe("image");
      finish();
    }));

    it("switches the preview with the thumbnail strip", fakeAsync(() => {
      seedCards([
        withOutputs(LAUNCH_ID, {
          image: { _id: "image", title: "Image", type: "image", data: IMAGE },
          caption: {
            _id: "caption",
            title: "Caption",
            type: "string",
            data: { type: "string", value: "A heron", length: 7 },
          },
        }),
      ]);
      const [card] = cards();
      const before = card.querySelector(".results").getAttribute("data-type");

      card
        .querySelector<HTMLButtonElement>(
          "app-launch-outputs footer button[aria-label=Caption]",
        )
        .click();
      fixture.detectChanges();

      expect(before).toBe("image");
      expect(card.querySelector(".results").getAttribute("data-type")).toBe(
        "string",
      );
      finish();
    }));

    it("shows a placeholder while a launch has no outputs", fakeAsync(() => {
      seedCards([listedLaunch(), withOutputs("launch_two", {})], {
        heartbeats: { [LAUNCH_ID]: new Date().toISOString() },
      });

      const placeholders = cards().map((card) =>
        card.querySelector("[data-testid=no-outputs]")?.textContent.trim(),
      );

      expect(states()).toEqual(["running", "done"]);
      expect(placeholders).toEqual(["No outputs yet", "No outputs"]);
      finish();
    }));

    it("shows the state, duration and a link to the launch", fakeAsync(() => {
      const failed = { ...listedLaunch("launch_two"), errors: ["Boom"] };
      seedCards([listedLaunch(), failed], {
        metrics: { [LAUNCH_ID]: { fromStart: 12 } },
      });

      const [first, second] = cards();

      expect(states()).toEqual(["done", "failed"]);
      expect(
        first.querySelector("[data-testid=launch-duration]").textContent.trim(),
      ).toBe("12 s");
      expect(second.querySelector("[data-testid=launch-duration]")).toBeNull();
      expect(first.querySelector("a.time").getAttribute("href")).toContain(
        `/launches/${LAUNCH_ID}`,
      );
      finish();
    }));

    /** Renders the cards, answering per-card metric and heartbeat reads. */
    function seedCards(
      launches: object[],
      {
        metrics = {},
        heartbeats = {},
      }: {
        metrics?: Record<string, object>;
        heartbeats?: Record<string, string>;
      } = {},
    ) {
      seedAuthorization(userPlain("owner"));
      configureAppTestingModule([
        { path: "launches", component: LaunchesComponent },
      ]);
      controller = TestBed.inject(HttpTestingController);
      socket = TestBed.inject(SocketDouble);
      fixture = TestBed.createComponent(AppComponent);
      TestBed.inject(Router).navigateByUrl("/launches");
      tick();
      fixture.detectChanges();
      const debug = fixture.debugElement.query(By.directive(LaunchesComponent));
      component = debug.componentInstance as LaunchesComponent;
      element = debug.nativeElement as HTMLElement;
      component.filter = new LaunchesFilter({ project: PROJECT_A_ID });
      fixture.detectChanges();
      controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
      controller.expectOne((r) => r.url === "/api/launches").flush(launches);
      tick(UI_DELAY);
      fixture.detectChanges();
      for (const r of controller.match((r) =>
        r.url.endsWith("/metrics/finished"),
      )) {
        const id = r.request.url.split("/")[3];
        r.flush(metrics[id] ?? null);
      }
      for (const r of controller.match((r) => r.url.endsWith("/heartbeat"))) {
        const id = r.request.url.split("/")[3];
        r.flush(heartbeats[id] ?? "");
      }
      fixture.detectChanges();
    }
  });
});
