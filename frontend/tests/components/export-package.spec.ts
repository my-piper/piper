import { HttpTestingController } from "@angular/common/http/testing";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { ExportPackageComponent } from "src/app/node-packages/export/export-package.component";
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { NodePackage } from "src/models/node-package";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import * as YAML from "yaml";
import { vi } from "vitest";
import { configureAppTestingModule, finish } from "../helpers/editor";
import { MonacoEditorStubComponent } from "../helpers/editor-stubs";

const EXPORT_URL = "/api/node-packages/tools/export";

function setup(language = Languages.en) {
  configureAppTestingModule();
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: {
      data: of({
        nodePackage: new NodePackage({ _id: "tools", title: "Tools" }),
      }),
    },
  });
  TestBed.overrideProvider(CURRENT_LANGUAGE, { useValue: language });
  const fixture = TestBed.createComponent(ExportPackageComponent);
  fixture.detectChanges();
  const controller = TestBed.inject(HttpTestingController);
  const element: HTMLElement = fixture.nativeElement;

  return {
    fixture,
    controller,
    element,
    load: (yaml: string) => {
      controller.expectOne(EXPORT_URL).flush(yaml);
      tick(UI_DELAY);
      fixture.detectChanges();
    },
  };
}

describe("ExportPackageComponent", () => {
  it("copies the original YAML after loading", fakeAsync(() => {
    const page = setup();
    const yaml = YAML.stringify({ _id: "tools", nodes: {} });
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const button = page.element.querySelector<HTMLButtonElement>("button");
    expect(button.disabled).toBe(true);
    page.load(yaml);

    button.click();

    expect(copy).toHaveBeenCalledExactlyOnceWith(yaml);
    page.controller.verify();
    finish();
  }));

  it("shows localized names and identifiers above read-only YAML", fakeAsync(() => {
    const page = setup(Languages.de);
    const yaml = YAML.stringify({
      _id: "tools",
      nodes: {
        echo: { title: "en=Echo;de=Widerhall" },
        fallback: {},
        same: { title: "same" },
      },
    });

    page.load(yaml);

    expect(
      Array.from(page.element.querySelectorAll(".nodes li")).map((li) =>
        li.textContent.trim(),
      ),
    ).toEqual(["Widerhall (echo)", "fallback", "same"]);
    expect(page.element.querySelectorAll(".nodes code")).toHaveLength(1);
    expect(
      page.element.querySelector<HTMLTextAreaElement>("textarea").value,
    ).toBe(yaml);
    const editor = page.fixture.debugElement.query(
      By.directive(MonacoEditorStubComponent),
    ).componentInstance as MonacoEditorStubComponent;
    expect(editor.options).toMatchObject({ language: "yaml", readOnly: true });
    page.controller.verify();
    finish();
  }));

  it("shows an empty package without inventing names", fakeAsync(() => {
    const page = setup();

    page.load(YAML.stringify({ _id: "tools", nodes: {} }));

    expect(page.element.querySelector(".nodes").textContent).toContain(
      "No nodes",
    );
    expect(
      page.element.querySelector<HTMLButtonElement>("button").disabled,
    ).toBe(false);
    page.controller.verify();
    finish();
  }));
});
