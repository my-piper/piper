import { TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of } from "rxjs";
import { PipelineReadmeComponent } from "src/app/pipeline-readme/pipeline-readme.component";
import { projectAPlain, userPlain } from "../fixtures/plain";
import { projectWith } from "../fixtures/models";
import { seedAuthorization } from "../helpers/config";
import { configureAppTestingModule } from "../helpers/editor";

describe("PipelineReadmeComponent", () => {
  function render(tags: string[]): HTMLElement {
    seedAuthorization(userPlain("owner"));
    configureAppTestingModule();
    const base = projectAPlain();
    const project = projectWith({
      ...(base["pipeline"] as object),
      tags,
    });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { data: of({ project }) },
    });
    const fixture = TestBed.createComponent(PipelineReadmeComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("links each tag chip to the projects filtered by it", () => {
    const element = render(["image", "", "en=Video;de=Film"]);

    const chips = Array.from(
      element.querySelectorAll<HTMLAnchorElement>("a[tuiChip]"),
    );
    expect(chips.map((c) => c.textContent.trim())).toEqual([
      "#image",
      "#Video",
    ]);
    expect(chips.map((c) => c.getAttribute("href"))).toEqual([
      "/projects?tag=image",
      "/projects?tag=en%3DVideo;de%3DFilm",
    ]);
  });

  it("shows no chips for a pipeline without tags", () => {
    const element = render([]);

    expect(element.querySelector(".tags")).toBeNull();
  });
});
