import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { EditNodeScriptComponent } from "src/app/edit-node-script/edit-node-script.component";
import { UI_DELAY } from "src/consts/ui";
import { NodeExecution } from "src/enums/node-execution";
import { projectA } from "../fixtures/models";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import { expectConsoleError } from "../helpers/console";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { typeInto } from "../helpers/editor-stubs";

const REFERENCE = "registry:artworks@3/echo_node/script.js";
const SOURCE =
  'import { next } from "../node.js";\nexport function run() { return next({}); }';

function setup(script = REFERENCE) {
  seedAuthorization(userPlain("engineer"));
  const project = projectA();
  const node = project.pipeline.nodes.values().next().value;
  node.script = script;
  const data = new BehaviorSubject({ project, node: { id: "node_one", node } });
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, { useValue: { data } });
  const controller = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(EditNodeScriptComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const save = () =>
    Array.from(element.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === "Save",
    );
  const editor = () => element.querySelector("textarea") as HTMLTextAreaElement;
  const settle = () => {
    tick(UI_DELAY);
    fixture.detectChanges();
  };
  const load = () => {
    controller.expectOne("/api/nodes/script-source").flush({ source: SOURCE });
    settle();
  };
  return { fixture, controller, node, editor, save, settle, load, data };
}

describe("pipeline node script editor", () => {
  it("loads script contents and blocks saving until they arrive", fakeAsync(() => {
    const page = setup();

    expect(page.save().disabled).toBe(true);
    page.load();

    expect(page.editor().value).toBe(SOURCE);
    expect(page.node.script).toBe(REFERENCE);
    expect(page.save().disabled).toBe(false);
    page.controller.verify();
    finish();
  }));

  it("keeps the original reference when saving only an execution change", fakeAsync(() => {
    const page = setup();
    page.load();
    page.fixture.componentInstance.form.controls.execution.setValue(
      NodeExecution.rapid,
    );

    page.save().click();
    const request = page.controller.expectOne("/api/nodes/prepare-script");
    request.flush({ script: REFERENCE, sign: "new-sign" });
    page.settle();

    expect(request.request.body.node.script).toBe(REFERENCE);
    expect(request.request.body.base).toBeUndefined();
    expect(page.node.script).toBe(REFERENCE);
    expect(page.node.execution).toBe(NodeExecution.rapid);
    expect(page.editor().value).toBe(SOURCE);
    page.controller.verify();
    finish();
  }));

  it("saves edited source with the original module as its import base", fakeAsync(() => {
    const page = setup();
    page.load();
    const edited = SOURCE.replace("next({})", 'next({ text: "edited" })');
    typeInto(page.editor(), edited);

    page.save().click();
    const request = page.controller.expectOne("/api/nodes/prepare-script");
    request.flush({ script: "normalized source", sign: "new-sign" });
    page.settle();

    expect(request.request.body.node.script).toBe(edited);
    expect(request.request.body.base).toBe(REFERENCE);
    expect(page.node.script).toBe("normalized source");
    expect(page.node.sign).toBe("new-sign");
    expect(page.editor().value).toBe("normalized source");
    page.controller.verify();
    finish();
  }));

  it("keeps Save disabled when source loading fails", fakeAsync(() => {
    expectConsoleError("Process HTTP error 404");
    const page = setup();

    page.controller
      .expectOne("/api/nodes/script-source")
      .flush("Missing script", { status: 404, statusText: "Not Found" });
    page.settle();

    expect(page.save().disabled).toBe(true);
    expect(page.node.script).toBe(REFERENCE);
    expect(page.fixture.nativeElement.textContent).toContain("Missing script");
    page.controller.verify();
    finish();
  }));

  it("shows existing inline scripts without fetching them", fakeAsync(() => {
    const page = setup(SOURCE);

    expect(page.editor().value).toBe(SOURCE);
    expect(page.save().disabled).toBe(false);
    page.controller.verify();
    finish();
  }));
});
