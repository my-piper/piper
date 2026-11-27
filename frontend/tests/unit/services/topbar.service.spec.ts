import { TemplateRef } from "@angular/core";
import { TopbarService } from "src/services/topbar.service";

function template() {
  return {} as TemplateRef<unknown>;
}

describe("TopbarService", () => {
  it("shows the page's template until that page clears it", () => {
    const topbar = new TopbarService();
    const page = template();

    topbar.set(page);
    const shown = topbar.content();
    topbar.clear(page);

    expect(shown).toBe(page);
    expect(topbar.content()).toBeNull();
  });

  it("keeps the next page's template when the previous page clears late", () => {
    const topbar = new TopbarService();
    const [previous, next] = [template(), template()];

    topbar.set(previous);
    topbar.set(next);
    topbar.clear(previous);

    expect(topbar.content()).toBe(next);
  });
});
