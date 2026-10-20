import { HttpClient, provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { debounceTime, Subject } from "rxjs";
import { NsfwDisclaimer } from "src/app/nsfw-disclaimer/nsfw-disclaimer.component";
import { AppConfig } from "src/models/app-config";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import compiled from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { Languages } from "src/ui-kit/enums/languages";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { toInstance, toPlain } from "src/utils/models";
import { provideTestConfig, TEST_BASE_URL } from "../helpers/config";
import { takeNetworkViolations } from "../helpers/isolation";
import { provideSocketDouble, SocketDouble } from "../helpers/socket";

describe("test harness", () => {
  it("resolves src/... imports through DI with the production config factory", () => {
    TestBed.configureTestingModule({
      providers: [
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    const http = TestBed.inject(HttpService);
    const config = TestBed.inject(AppConfig);

    expect(http).toBeInstanceOf(HttpService);
    expect(config.baseUrl).toBe(TEST_BASE_URL);
    expect(config.captcha.required).toBeFalse();
    expect(config.assistant.active).toBeFalse();
  });

  it("imports the checked-in compiled JSON schemas", () => {
    const definitions = compiled as Record<string, unknown>;

    expect(Object.keys(definitions)).toContain("pipeline");
  });

  it("converts decorated nested models with real class-transformer", () => {
    const plain = {
      _id: "project_a",
      createdAt: "2026-01-02T03:04:05.000Z",
      revision: "r1",
      pipeline: {
        name: "Harness",
        start: { nodes: ["n1"] },
        inputs: {},
        outputs: {},
        flows: {},
        nodes: {
          n1: {
            title: "First",
            inputs: { prompt: { type: "string", default: "" } },
            outputs: {},
          },
        },
      },
      launchRequest: { inputs: { zero: 0, off: false } },
      unknownField: "dropped",
    };

    const project = toInstance(plain, Project);

    expect(project).toBeInstanceOf(Project);
    expect(project.createdAt).toEqual(new Date("2026-01-02T03:04:05.000Z"));
    expect(project.pipeline.nodes).toBeInstanceOf(Map);
    expect(project.pipeline.nodes.get("n1")).toBeInstanceOf(Node);
    expect(project.pipeline.nodes.get("n1").inputs.get("prompt").default).toBe(
      "",
    );
    expect(project.launchRequest.inputs.get("zero")).toBe(0);
    expect(project.launchRequest.inputs.get("off")).toBeFalse();
    expect("unknownField" in project).toBeFalse();
    expect(toPlain(project).pipeline.nodes.n1.title).toBe("First");
  });

  describe("component with an external template", () => {
    let fixture: ComponentFixture<NsfwDisclaimer>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        declarations: [NsfwDisclaimer],
        providers: [{ provide: CURRENT_LANGUAGE, useValue: Languages.en }],
      }).compileComponents();
      fixture = TestBed.createComponent(NsfwDisclaimer);
      fixture.detectChanges();
    });

    it("renders the real template and emits through its output", () => {
      const agreed = jasmine.createSpy("agree");
      fixture.componentInstance.agree.subscribe(agreed);

      fixture.debugElement
        .query(By.css("button.primary"))
        .triggerEventHandler("click");

      expect(fixture.nativeElement.querySelector("h2").textContent).toContain(
        "NSFW Content Disclaimer",
      );
      expect(agreed).toHaveBeenCalledTimes(1);
    });
  });

  it("drives timed observables with a fake clock", fakeAsync(() => {
    const source = new Subject<number>();
    const seen: number[] = [];
    const subscription = source.pipe(debounceTime(1000)).subscribe((v) => {
      seen.push(v);
    });

    source.next(1);
    tick(500);
    source.next(2);
    tick(999);
    const beforeDebounce = [...seen];
    tick(1);
    subscription.unsubscribe();

    expect(beforeDebounce).toEqual([]);
    expect(seen).toEqual([2]);
  }));

  describe("network isolation", () => {
    it("rejects unexpected fetch and records a violation", async () => {
      let error: Error | null = null;

      try {
        await fetch("/api/projects");
      } catch (e) {
        error = e as Error;
      }
      const violations = takeNetworkViolations();

      expect(error?.message).toContain("Unexpected fetch request");
      expect(violations.length).toBe(1);
    });

    it("rejects HttpClient traffic that bypasses HttpTestingController", () => {
      TestBed.configureTestingModule({ providers: [provideHttpClient()] });
      const errors: unknown[] = [];

      TestBed.inject(HttpClient)
        .get("/api/me")
        .subscribe({ error: (e) => errors.push(e) });
      const violations = takeNetworkViolations();

      expect(violations.length).toBe(1);
      expect(violations[0]).toContain("XMLHttpRequest GET");
      expect(errors.length).toBe(1);
    });

    it("rejects real WebSocket connections", () => {
      expect(() => new WebSocket("ws://localhost/socket.io/")).toThrowError(
        /Unexpected WebSocket request/,
      );

      expect(takeNetworkViolations().length).toBe(1);
    });

    it("keeps HttpTestingController-backed requests verifiable", () => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const controller = TestBed.inject(HttpTestingController);
      let body: unknown = null;

      TestBed.inject(HttpClient)
        .get("/api/me")
        .subscribe((b) => (body = b));
      controller.expectOne("/api/me").flush({ _id: "u1" });

      expect(body).toEqual({ _id: "u1" });
      controller.verify();
    });
  });

  describe("storage and socket isolation", () => {
    // Specs run in random order; each one must observe clean state.
    for (const i of [1, 2]) {
      it(`starts with empty storage (${i})`, () => {
        const before = localStorage.length;
        localStorage.setItem("leak", String(i));

        expect(before).toBe(0);
      });
    }

    it("gives each socket double independent subscriptions", () => {
      const first = new SocketDouble();
      const second = new SocketDouble();
      const seen: unknown[] = [];
      const subscription = first.fromEvent("node_done").subscribe((e) => {
        seen.push(e);
      });

      second.receive("node_done", { node: "other" });
      first.receive("node_done", { node: "mine" });
      subscription.unsubscribe();

      expect(seen).toEqual([{ node: "mine" }]);
      expect(first.listenerCount()).toBe(0);
    });

    it("provides the socket double under the ngx-socket-io token", () => {
      TestBed.configureTestingModule({ providers: provideSocketDouble() });

      expect(TestBed.inject(SocketDouble)).toBeInstanceOf(SocketDouble);
    });
  });
});
