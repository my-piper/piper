import { HttpTestingController } from "@angular/common/http/testing";
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { ProjectStatsComponent } from "src/app/project-stats/project-stats.component";
import { PROJECT_A_ID, userPlain } from "../fixtures/plain";
import { projectA } from "../fixtures/models";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule, finish } from "../helpers/editor";

/**
 * GET /api/projects/:_id/stats?days=7|30|90 summarises finished launches,
 * runs per day and the slowest nodes of the last week
 * (backend/api/projects/stats/get-project-stats.ts).
 */
const UI_DELAY = 250;

function statsPlain(days: number, overrides: object = {}) {
  return {
    days,
    runs: 4,
    succeeded: 3,
    failed: 1,
    interrupted: 0,
    successRate: 0.75,
    avgDurationMs: 1500,
    lastRunAt: "2026-11-09T10:00:00.000Z",
    p50DurationMs: 1200,
    p95DurationMs: 3000,
    maxDurationMs: 3100,
    avgQueuedMs: 250,
    daily: [
      {
        day: "2026-11-09",
        succeeded: 3,
        failed: 1,
        interrupted: 0,
        avgDurationMs: 1500,
      },
    ],
    nodes: [
      {
        node: "node_one",
        runs: 4,
        failed: 1,
        avgDurationMs: 900,
        p95DurationMs: 2000,
        avgWaitMs: 40,
      },
    ],
    ...overrides,
  };
}

describe("ProjectStatsComponent", () => {
  let fixture: ComponentFixture<ProjectStatsComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;

  function setup() {
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule();
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { data: of({ project: projectA() }) },
    });
    controller = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectStatsComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  }

  function answer(days: number, body: object) {
    const request = controller.expectOne(
      (r) => r.url === `/api/projects/${PROJECT_A_ID}/stats`,
    );
    request.flush(body);
    tick(UI_DELAY);
    fixture.detectChanges();
    return request;
  }

  function text(testId: string): string {
    return element
      .querySelector(`[data-testid=${testId}]`)
      ?.textContent.replace(/\s+/g, " ")
      .trim();
  }

  afterEach(() => controller.verify());

  it("loads 30 days and shows the summary tiles", fakeAsync(() => {
    setup();

    const request = answer(30, statsPlain(30));

    expect(request.request.params.get("days")).toBe("30");
    expect(text("stats-runs")).toBe("4");
    expect(text("stats-success-rate")).toBe("75%");
    expect(text("stats-avg-duration")).toBe("1.5s");
    expect(text("stats-avg-queue")).toBe("250ms");
    fixture.destroy();
    finish();
  }));

  it("draws a column for every day of the period", fakeAsync(() => {
    setup();

    answer(30, statsPlain(30));

    const days = element.querySelectorAll("[data-testid=stats-daily] .day");
    expect(days.length).toBe(30);
    fixture.destroy();
    finish();
  }));

  it("names the slowest nodes by their pipeline title", fakeAsync(() => {
    setup();

    answer(30, statsPlain(30));

    const row = element.querySelector("[data-testid=stats-nodes] tbody tr");
    expect(row.textContent).toContain("Generate text");
    expect(row.textContent).toContain("node_one");
    expect(row.textContent).toContain("900ms");
    fixture.destroy();
    finish();
  }));

  it("reloads for another period", fakeAsync(() => {
    setup();
    answer(30, statsPlain(30));

    element
      .querySelector<HTMLButtonElement>("[data-testid=stats-period-7]")
      .click();
    const request = answer(7, statsPlain(7));

    expect(request.request.params.get("days")).toBe("7");
    expect(
      element.querySelectorAll("[data-testid=stats-daily] .day").length,
    ).toBe(7);
    expect(
      element
        .querySelector("[data-testid=stats-period-7]")
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fixture.destroy();
    finish();
  }));

  it("explains an empty period", fakeAsync(() => {
    setup();

    answer(
      30,
      statsPlain(30, {
        runs: 0,
        succeeded: 0,
        failed: 0,
        successRate: null,
        avgDurationMs: null,
        lastRunAt: null,
        daily: [],
        nodes: [],
      }),
    );

    expect(text("stats-empty")).toBe("No finished runs in this period.");
    expect(element.querySelector("[data-testid=stats-tiles]")).toBeNull();
    fixture.destroy();
    finish();
  }));
});
