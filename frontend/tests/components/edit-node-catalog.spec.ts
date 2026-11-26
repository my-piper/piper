import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  fakeAsync,
  flushMicrotasks,
  TestBed,
  tick,
} from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { EditNodeCatalogComponent } from "src/app/edit-node-catalog/edit-node-catalog.component";
import { TaigaFormsModule } from "src/app/taiga-forms.module";
import { Languages } from "src/enums/languages";
import { NodeCatalog } from "src/models/node";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { ProjectManager } from "src/services/project.manager";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { toInstance } from "src/utils/models";
import { projectA } from "../fixtures/models";
import { userPlain } from "../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../helpers/config";
import { finish } from "../helpers/editor";
import { editJson, JsonEditorStubComponent } from "../helpers/json-editor-stub";

/** POST /api/nodes publishes a node to the catalog (backend/api/nodes). */
const UI_DELAY = 250;

function setup(catalog?: object) {
  seedAuthorization(userPlain("engineer"));
  const project = projectA();
  const node = project.pipeline.nodes.get("node_one");
  if (catalog) {
    node.catalog = toInstance(catalog, NodeCatalog);
  }
  TestBed.configureTestingModule({
    declarations: [EditNodeCatalogComponent],
    imports: [
      ReactiveFormsModule,
      UiKitModule,
      TaigaFormsModule,
      JsonEditorStubComponent,
    ],
    providers: [
      provideTestConfig(),
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: CURRENT_LANGUAGE, useValue: Languages.en },
      {
        provide: ActivatedRoute,
        useValue: { data: of({ project, node: { id: "node_one", node } }) },
      },
    ],
  });
  const manager = TestBed.inject(ProjectManager);
  manager.project = project;
  const controller = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(EditNodeCatalogComponent);
  const element: HTMLElement = fixture.nativeElement;
  fixture.detectChanges();
  flushMicrotasks();
  fixture.detectChanges();
  const button = (label: string) =>
    Array.from(element.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === label,
    );

  return {
    fixture,
    controller,
    element,
    node,
    manager,
    button,
    click: (label: string) => {
      button(label).click();
      fixture.detectChanges();
      flushMicrotasks();
      fixture.detectChanges();
    },
    editor: () =>
      element.querySelector<HTMLTextAreaElement>("textarea.json-editor-stub"),
  };
}

describe("EditNodeCatalogComponent", () => {
  it("creates a catalog config named after the node", fakeAsync(() => {
    const page = setup();
    const offered = !!page.button("Create config");

    page.click("Create config");

    expect(offered).toBe(true);
    expect(JSON.parse(page.editor().value)).toEqual(
      expect.objectContaining({
        _id: "generate_text",
        version: 1,
        package: "some_package",
      }),
    );
    finish();
  }));

  it("keeps an edited config in the node and publishes it", fakeAsync(() => {
    const page = setup({ _id: "generate_text", version: 1, package: "tools" });
    editJson(page.element, {
      _id: "generate_text",
      version: 2,
      package: "tools",
    });
    page.fixture.detectChanges();

    page.click("Publish");
    const request = page.controller.expectOne("/api/nodes");
    request.flush({});
    tick(UI_DELAY);

    expect(page.node.catalog.version).toBe(2);
    expect(page.manager.status.value).toBe("dirty");
    expect(request.request.method).toBe("POST");
    expect(request.request.body.catalog).toEqual(
      expect.objectContaining({ _id: "generate_text", version: 2 }),
    );
    page.controller.verify();
    finish();
  }));

  it("lists the form's validation messages", fakeAsync(() => {
    const page = setup({ _id: "generate_text", version: 1, package: "tools" });

    page.fixture.componentInstance.form.setErrors({
      validate: ["ID is too short", "Version is required"],
    });
    page.fixture.detectChanges();

    expect(
      Array.from(page.element.querySelectorAll("tui-error")).map((e) =>
        e.textContent.trim(),
      ),
    ).toEqual(["ID is too short", "Version is required"]);
    finish();
  }));

  it("removes the config from the node", fakeAsync(() => {
    const page = setup({ _id: "generate_text", version: 1, package: "tools" });

    page.click("Remove");

    expect(page.node.catalog).toBeUndefined();
    expect(page.button("Create config")).toBeDefined();
    finish();
  }));
});
