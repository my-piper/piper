import { HttpTestingController } from "@angular/common/http/testing";
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { AppModule } from "src/app/app.module";
import { configureAppTestingModule, finish } from "../helpers/editor";

const UI_DELAY = 250;

/**
 * GET /api/artefacts lists the artefacts matching the filter
 * (backend/api/artefacts/list.ts).
 */
@Component({
  selector: "app-artefacts-host",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<app-artefacts
    [filter]="{ project: 'project_aaaa' }"
  ></app-artefacts>`,
})
class ArtefactsHostComponent {}

describe("ArtefactsComponent", () => {
  it("shows a placeholder while the artefacts load, then says none were found", fakeAsync(() => {
    TestBed.overrideModule(AppModule, {
      add: { declarations: [ArtefactsHostComponent] },
    });
    configureAppTestingModule();
    const controller = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ArtefactsHostComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const list = controller.expectOne((r) => r.url === "/api/artefacts");

    expect(list.request.params.get("project")).toBe("project_aaaa");
    expect(element.querySelector("[data-testid=loading]")).not.toBeNull();

    list.flush([]);
    tick(UI_DELAY);
    fixture.detectChanges();

    expect(element.querySelector("[data-testid=loading]")).toBeNull();
    expect(element.textContent).toContain("Nothing found.");
    controller.verify();
    fixture.destroy();
    finish();
  }));
});
