import { CommonModule } from "@angular/common";
import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { TuiButton, TuiDataList, TuiDropdown, TuiIcon } from "@taiga-ui/core";
import { TuiBadge, TuiTabs } from "@taiga-ui/kit";
import {
  provideRouter,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { ProjectComponent } from "src/app/project/project.component";
import { SaveProjectGuard } from "src/guards/save-project.guard";
import { CanPipe } from "src/pipes/can";
import { IsPipe } from "src/pipes/is";
import { DeclaredVariablesPipe } from "src/pipes/declared-variables";
import { PipelineNodeUpdatesPipe } from "src/pipes/pipeline-node-updates";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { IconComponent } from "src/ui-kit/icon/icon.component";
import { InformerComponent } from "src/ui-kit/informer/informer.component";
import { I18nPipe } from "src/pipes/i18n.pipe";
import { InvalidFieldPipe } from "src/pipes/invalid-field.pipe";
import { LengthPipe } from "src/pipes/length.pipe";
import { ModalDirective } from "src/ui-kit/modal/modal.directive";
import { PopoverDirective } from "src/ui-kit/popover/popover.directive";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { projectA } from "../fixtures/models";
import {
  PATCH_PROJECT_URL,
  patchResponsePlain,
  PROJECT_A_ID,
  revisionConflict,
  userPlain,
} from "../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../helpers/config";
import { provideSocketDouble } from "../helpers/socket";

const NODE_UPDATES_URL = `/api/projects/${PROJECT_A_ID}/check-node-updates`;

describe("ProjectComponent save errors", () => {
  async function render() {
    seedAuthorization(userPlain("owner"));
    const project = projectA();
    TestBed.configureTestingModule({
      declarations: [
        ProjectComponent,
        IconComponent,
        InformerComponent,
        ModalDirective,
        PopoverDirective,
        CanPipe,
        IsPipe,
        LengthPipe,
        I18nPipe,
        InvalidFieldPipe,
        DeclaredVariablesPipe,
        PipelineNodeUpdatesPipe,
      ],
      imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        RouterLinkActive,
        RouterOutlet,
        TuiButton,
        TuiIcon,
        ...TuiDataList,
        ...TuiDropdown,
        TuiBadge,
        ...TuiTabs,
      ],
      providers: [
        provideTestConfig(),
        provideSocketDouble(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: CURRENT_LANGUAGE, useValue: Languages.en },
        provideRouter([
          {
            path: "projects/:id",
            component: ProjectComponent,
            canDeactivate: [SaveProjectGuard],
            resolve: {
              project: () => {
                TestBed.inject(ProjectManager).project = project;
                return project;
              },
            },
          },
          { path: "elsewhere", children: [] },
        ]),
      ],
    });
    const controller = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    return { harness, controller, project };
  }

  function flushBackground(controller: HttpTestingController) {
    controller.match("/api/me").forEach((r) => r.flush(userPlain("owner")));
    controller.match(NODE_UPDATES_URL).forEach((r) => r.flush(null));
  }

  it("shows a failed save, keeps the project and recovers on retry", fakeAsync(async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const { harness, controller, project } = await render();
    harness.navigateByUrl(`/projects/${PROJECT_A_ID}`);
    tick();
    flushBackground(controller);
    harness.detectChanges();
    const manager = TestBed.inject(ProjectManager);
    project.pipeline.nodes.get("node_one").arrange.x = 640;
    const conflict = revisionConflict("rev_server");

    manager.kick();
    controller
      .expectOne(PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_1"))
      .flush(conflict.body, conflict);
    tick(UI_DELAY);
    harness.detectChanges();
    const informer = harness.routeNativeElement.querySelector("app-informer");
    const message = informer?.textContent;
    (informer.querySelector("button.primary") as HTMLButtonElement).click();
    harness.detectChanges();
    const dismissed = harness.routeNativeElement.querySelector("app-informer");
    manager.kick();
    controller
      .expectOne(PATCH_PROJECT_URL(PROJECT_A_ID, "rev_a_1"))
      .flush(patchResponsePlain("rev_a_2"));
    tick(UI_DELAY);
    flushBackground(controller);
    harness.detectChanges();

    expect(message).toContain("Version on sever is more fresh version");
    expect(dismissed).toBeNull();
    expect(manager.project).toBe(project);
    expect(project.revision).toBe("rev_a_2");
    expect(manager.status.value).toBe("saved");
    expect(
      harness.routeNativeElement
        .querySelector("[data-status]")
        ?.getAttribute("data-status"),
    ).toBe("saved");
    controller.verify();
  }));
});
