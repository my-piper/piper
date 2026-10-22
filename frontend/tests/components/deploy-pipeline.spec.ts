import { provideHttpClient } from "@angular/common/http";
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
import { ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, provideRouter, RouterModule } from "@angular/router";
import { of } from "rxjs";
import { DeployPipelineComponent } from "src/app/deploy-pipeline/deploy-pipeline.component";
import { Project } from "src/models/project";
import { CanPipe } from "src/pipes/can";
import { ProjectManager } from "src/services/project.manager";
import { Languages } from "src/ui-kit/enums/languages";
import { TickerPipe } from "src/ui-kit/pipes/ticker.pipe";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { deploysPlain } from "../fixtures/launch-results";
import { projectA } from "../fixtures/models";
import { PROJECT_A_ID, USER_IDS, userPlain, UserKind } from "../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../helpers/config";
import { finish } from "../helpers/editor";
import { asJitPipes } from "../helpers/jit";
import { editJson, JsonEditorStubComponent } from "../helpers/json-editor-stub";
import { provideSocketDouble } from "../helpers/socket";
import { expectConsoleError } from "../helpers/console";

/**
 * Wire contracts:
 * - GET /api/projects/:project/deploys (backend/api/projects/deploys/list.ts)
 * - POST /api/projects/:_id/deploy with a DeployConfig body; non-admins may
 *   only deploy under their own prefix (backend/api/projects/deploy-project.ts)
 * - DELETE /api/deploys/:prefix/:slug or /api/deploys/:slug; the prefix-less
 *   form requires an admin (backend/api/deploys/remove-deploy.ts)
 */
const UI_DELAY = 250;
const DEPLOYS_URL = `/api/projects/${PROJECT_A_ID}/deploys`;

describe("DeployPipelineComponent", () => {
  let fixture: ComponentFixture<DeployPipelineComponent>;
  let controller: HttpTestingController;
  let element: HTMLElement;

  function setup({
    user = "owner",
    project = projectA(),
  }: { user?: UserKind; project?: Project } = {}) {
    seedAuthorization(userPlain(user));
    asJitPipes(TickerPipe);
    TestBed.configureTestingModule({
      declarations: [DeployPipelineComponent, CanPipe],
      imports: [
        ReactiveFormsModule,
        RouterModule,
        UiKitModule,
        JsonEditorStubComponent,
      ],
      providers: [
        provideTestConfig(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSocketDouble(),
        { provide: CURRENT_LANGUAGE, useValue: Languages.en },
        { provide: ActivatedRoute, useValue: { data: of({ project }) } },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
    TestBed.inject(ProjectManager).project = project;
    fixture = TestBed.createComponent(DeployPipelineComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    controller.match("/api/me").forEach((r) => r.flush(userPlain(user)));
    fixture.detectChanges();
    return project;
  }

  function list(deploys = deploysPlain()) {
    controller.expectOne(DEPLOYS_URL).flush(deploys);
    tick(UI_DELAY);
    fixture.detectChanges();
  }

  function rows(): string[] {
    return Array.from(element.querySelectorAll("tbody tr:not(.loading) a")).map(
      (a) => a.textContent.replace(/\s+/g, ""),
    );
  }

  function removeButtons(): HTMLButtonElement[] {
    return Array.from(element.querySelectorAll("tbody tr button.circle"));
  }

  afterEach(() => controller.verify());

  it("shows loading, then the current deploys", fakeAsync(() => {
    setup();

    const loading = element.querySelector("tr.loading");
    list();

    expect(loading).not.toBeNull();
    expect(element.querySelector("tr.loading")).toBeNull();
    expect(rows()).toEqual(["user_owner/small-graph-v1", "global-graph"]);
    finish();
  }));

  it("defaults the deploy config to the user's prefix and a slug from the title", fakeAsync(() => {
    setup();
    list();

    const value = fixture.componentInstance.form.getRawValue().deploy;

    expect(value).toEqual({ prefix: USER_IDS.owner, slug: "project-a-v1" });
    finish();
  }));

  it("uses the stored deploy config when the pipeline has one", fakeAsync(() => {
    const project = projectA();
    project.pipeline.deploy = { prefix: "team", slug: "stored" } as never;
    setup({ project });
    list();

    const value = fixture.componentInstance.form.getRawValue().deploy;

    expect(value).toEqual({ prefix: "team", slug: "stored" });
    finish();
  }));

  it("locks the prefix for non-admins only", fakeAsync(() => {
    setup({ user: "owner" });
    list();
    const owner = element
      .querySelector("textarea.json-editor-stub")
      .getAttribute("data-disable");
    TestBed.resetTestingModule();

    setup({ user: "admin" });
    list();
    const admin = element
      .querySelector("textarea.json-editor-stub")
      .getAttribute("data-disable");

    expect(owner).toBe("root.prefix");
    expect(admin).toBe("");
    finish();
  }));

  it("debounces config edits into one pipeline change", fakeAsync(() => {
    const project = setup();
    list();
    const manager = TestBed.inject(ProjectManager);
    const markDirty = spyOn(manager, "markDirty");

    editJson(element, { prefix: USER_IDS.owner, slug: "first" });
    tick(500);
    editJson(element, { prefix: USER_IDS.owner, slug: "second" });
    tick(999);
    const early = markDirty.calls.count();
    tick(1);

    expect(early).toBe(0);
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(project.pipeline.deploy.slug).toBe("second");
    finish();
  }));

  it("deploys the edited config and refreshes the list", fakeAsync(() => {
    setup();
    list([]);
    editJson(element, { prefix: USER_IDS.owner, slug: "fresh" });
    tick(1000);

    (element.querySelector("footer button.primary") as HTMLElement).click();
    fixture.detectChanges();
    const request = controller.expectOne(
      `/api/projects/${PROJECT_A_ID}/deploy`,
    );
    const busy = fixture.componentInstance.progress.deploying;
    request.flush(null);
    tick(UI_DELAY);
    list([{ _id: "user_owner_fresh", prefix: USER_IDS.owner, slug: "fresh" }]);

    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      prefix: USER_IDS.owner,
      slug: "fresh",
    });
    expect(busy).toBeTrue();
    expect(fixture.componentInstance.progress.deploying).toBeFalse();
    expect(rows()).toEqual(["user_owner/fresh"]);
    finish();
  }));

  it("shows a deploy failure message and resets progress", fakeAsync(() => {
    expectConsoleError("Process HTTP error 400");
    setup();
    list([]);

    (element.querySelector("footer button.primary") as HTMLElement).click();
    controller
      .expectOne(`/api/projects/${PROJECT_A_ID}/deploy`)
      .flush("You can't deploy this project in this prefix", {
        status: 400,
        statusText: "Bad Request",
      });
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(element.querySelector("app-informer p").textContent.trim()).toBe(
      "You can't deploy this project in this prefix",
    );
    expect(fixture.componentInstance.progress.deploying).toBeFalse();
    finish();
  }));

  it("removes a prefixed deploy through its prefix/slug route", fakeAsync(() => {
    setup();
    list();

    removeButtons()[0].click();
    fixture.detectChanges();
    const request = controller.expectOne(
      "/api/deploys/user_owner/small-graph-v1",
    );
    const busy = removeButtons()[0].classList.contains("busy");
    request.flush(null);
    tick(UI_DELAY);
    list([deploysPlain()[1]]);

    expect(request.request.method).toBe("DELETE");
    expect(busy).toBeTrue();
    expect(rows()).toEqual(["global-graph"]);
    finish();
  }));

  it("removes a deploy without prefix through its slug route", fakeAsync(() => {
    setup({ user: "admin" });
    list();

    removeButtons()[1].click();
    controller.expectOne("/api/deploys/global-graph").flush(null);
    tick(UI_DELAY);
    list([deploysPlain()[0]]);

    expect(rows()).toEqual(["user_owner/small-graph-v1"]);
    finish();
  }));

  it("shows a removal failure and keeps the deploy listed", fakeAsync(() => {
    expectConsoleError("Process HTTP error 403");
    setup();
    list();

    removeButtons()[0].click();
    controller
      .expectOne("/api/deploys/user_owner/small-graph-v1")
      .flush("Forbidden", { status: 403, statusText: "Forbidden" });
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(element.querySelector("app-informer p").textContent.trim()).toBe(
      "Forbidden",
    );
    expect(rows().length).toBe(2);
    expect(removeButtons()[0].classList.contains("busy")).toBeFalse();
    finish();
  }));
});
