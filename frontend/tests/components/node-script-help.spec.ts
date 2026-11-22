import { TestBed } from "@angular/core/testing";
import { NodeScriptHelpComponent } from "src/app/node-script-help/node-script-help.component";
import { SCRIPT_EXAMPLES } from "src/app/node-script-help/script-examples";
import { configureAppTestingModule } from "../helpers/editor";

function setup({ scriptNode = false } = {}) {
  configureAppTestingModule();
  const fixture = TestBed.createComponent(NodeScriptHelpComponent);
  fixture.componentRef.setInput("scriptNode", scriptNode);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const tabs = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>("[tuiTab]"));
  const tab = (title: string) => tabs().find((t) => t.textContent === title);
  const code = () => element.querySelector("pre").textContent;
  return { fixture, element, tabs, tab, code };
}

describe("node script examples", () => {
  it("lists every situation and starts with inputs and outputs", () => {
    const page = setup();

    const titles = page.tabs().map((tab) => tab.textContent);

    expect(titles).toEqual([
      "Inputs and outputs",
      "Different outputs",
      "Results of other nodes",
      "Environment Variables",
      "Child Launches",
      "Long tasks",
      "Errors and logs",
    ]);
    expect(page.code()).toContain('__type: "next"');
  });

  it("shows the example of the picked situation", () => {
    const page = setup();

    page.tab("Child Launches").click();
    page.fixture.detectChanges();

    expect(page.element.textContent).toContain(
      "A failed child fails this node",
    );
    expect(page.code()).toContain('__type: "launch"');
    expect(page.code()).toContain("children?.summary");
  });

  it("gives only valid JavaScript with a run function", () => {
    const examples = SCRIPT_EXAMPLES;

    const bodies = examples.map(({ code }) => code.replace(/^export /gm, ""));

    for (const body of [
      ...bodies,
      ...examples
        .filter(({ scriptNode }) => scriptNode)
        .map(({ scriptNode }) => scriptNode.code.replace(/^export /gm, "")),
    ]) {
      expect(() => new Function(body)).not.toThrow();
      expect(body).toMatch(/^async function run\(/m);
    }
  });

  it("reads Variables from env for a catalog node", () => {
    const page = setup();

    page.tab("Environment Variables").click();
    page.fixture.detectChanges();

    expect(page.code()).toContain("env.variables");
  });

  it("passes values through inputs for a Script Node, which has no Environment", () => {
    const page = setup({ scriptNode: true });

    page.tab("Environment Variables").click();
    page.fixture.detectChanges();

    expect(page.element.textContent).toContain(
      "A Script Node never reads an Environment",
    );
    expect(page.code()).toContain("inputs.apiKey");
    expect(page.code()).not.toContain("env");
  });
});
