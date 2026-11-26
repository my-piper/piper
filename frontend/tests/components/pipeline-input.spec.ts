import { TestBed } from "@angular/core/testing";
import { PipelineInputComponent } from "src/app/pipeline-input/pipeline-input.component";
import { PipelineInput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { ProjectManager } from "src/services/project.manager";
import { toInstance } from "src/utils/models";
import { projectA } from "../fixtures/models";
import { configureAppTestingModule } from "../helpers/editor";

/** The cap on a field with options, from edit-input.component.scss. */
const FIELD_MAX_WIDTH = 300;
/** The cap on a node with a plain single-line text input. */
const TEXT_MAX_WIDTH = 150;
/** An option wider than the text cap, narrower than the field cap. */
const LONG = "Cinematic portrait lighting";

describe("PipelineInputComponent", () => {
  let project: Project;

  /**
   * Renders a canvas input node. It is absolutely positioned, as on the
   * canvas, so it shrinks to its content.
   */
  function render(id: string, input: object): HTMLElement {
    project.pipeline.inputs.set(id, toInstance(input, PipelineInput));
    const fixture = TestBed.createComponent(PipelineInputComponent);
    Object.assign(fixture.componentInstance, {
      id,
      input: project.pipeline.inputs.get(id),
      project,
      launchRequest: project.launchRequest,
    });
    const element: HTMLElement = fixture.nativeElement;
    element.style.position = "absolute";
    fixture.detectChanges();
    return element;
  }

  function field(node: HTMLElement): HTMLElement {
    return node.querySelector("tui-textfield");
  }

  function width(element: HTMLElement): number {
    return element.getBoundingClientRect().width;
  }

  /** The width of `text` in the element's font. */
  function textWidth(element: HTMLElement, text: string): number {
    const context = document.createElement("canvas").getContext("2d");
    context.font = getComputedStyle(element).font;
    return context.measureText(text).width;
  }

  /** The element's width inside its padding: where its text goes. */
  function contentWidth(element: HTMLElement): number {
    const style = getComputedStyle(element);
    return (
      element.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  }

  function stringInput(options: object): object {
    return {
      title: "Style",
      type: "string",
      flows: {},
      arrange: { x: 0, y: 0 },
      ...options,
    };
  }

  /** Configures TestBed; `nativeSelect` for the specs rendering a select. */
  function setup(nativeSelect: boolean) {
    configureAppTestingModule([], { nativeSelect });
    project = projectA();
    TestBed.inject(ProjectManager).project = project;
  }

  it("sizes a select to its longest option, not to the selected one", () => {
    setup(true);
    const short = render(
      "short",
      stringInput({ enum: ["a", "b"], default: "a" }),
    );
    const long = render(
      "long",
      stringInput({ enum: ["a", LONG], default: "a" }),
    );

    const shortWidth = width(short);
    const longWidth = width(long);

    expect(longWidth).toBeGreaterThan(shortWidth);
    expect(longWidth).toBeGreaterThan(TEXT_MAX_WIDTH);
  });

  it("shows the longest option without cutting it off", () => {
    setup(true);
    const node = render(
      "style",
      stringInput({
        enum: ["a", LONG],
        default: LONG,
      }),
    );

    const select = node.querySelector("select");

    expect(textWidth(select, LONG)).toBeLessThanOrEqual(contentWidth(select));
  });

  it("sizes a freeform input to its longest suggestion", () => {
    setup(false);
    const node = render(
      "endpoint",
      stringInput({
        enum: ["image-to-video", "text-to-video-with-audio-and-subtitles"],
        freeform: true,
      }),
    );

    const nodeWidth = width(node);

    expect(nodeWidth).toBeGreaterThan(TEXT_MAX_WIDTH);
  });

  it("caps a field with a very long option", () => {
    setup(true);
    const node = render(
      "style",
      stringInput({ enum: ["a", "Cinematic ".repeat(20).trim()] }),
    );

    const fieldWidth = width(field(node));

    expect(fieldWidth).toBeLessThanOrEqual(FIELD_MAX_WIDTH);
    expect(fieldWidth).toBeGreaterThan(FIELD_MAX_WIDTH - 1);
  });

  it("keeps the 150px cap on a plain text input", () => {
    setup(false);
    const node = render(
      "topic",
      stringInput({ default: "A very long default value for the topic" }),
    );

    const nodeWidth = width(node);

    expect(nodeWidth).toBeLessThanOrEqual(TEXT_MAX_WIDTH);
  });
});
