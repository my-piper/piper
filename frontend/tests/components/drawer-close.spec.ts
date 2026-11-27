import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, RouterOutlet } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { DrawerCloseComponent } from "src/app/drawer-close/drawer-close.component";

@Component({
  template: `<p>canvas</p>
    <router-outlet name="left" /><router-outlet name="right" />`,
  imports: [RouterOutlet],
})
class CanvasStubComponent {}

@Component({
  template: `<app-drawer-close outlet="left" />`,
  imports: [DrawerCloseComponent],
})
class LeftDrawerStubComponent {}

@Component({
  template: `<app-drawer-close outlet="right" />`,
  imports: [DrawerCloseComponent],
})
class RightDrawerStubComponent {}

describe("DrawerCloseComponent", () => {
  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: "canvas",
            component: CanvasStubComponent,
            children: [
              {
                path: "add",
                outlet: "left",
                component: LeftDrawerStubComponent,
              },
              {
                path: "node",
                outlet: "right",
                component: RightDrawerStubComponent,
              },
            ],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  it("closes only its own outlet and keeps the canvas", async () => {
    const harness = await open("/canvas/(left:add//right:node)");
    const router = TestBed.inject(Router);
    const leftClose = (
      harness.fixture.nativeElement as HTMLElement
    ).querySelector("app-drawer-close button") as HTMLButtonElement;

    leftClose.click();
    await harness.fixture.whenStable();

    expect(router.url).toBe("/canvas/(right:node)");
  });

  it("labels its button for screen readers", async () => {
    const harness = await open("/canvas/(right:node)");

    const button = (harness.fixture.nativeElement as HTMLElement).querySelector(
      "[data-testid=drawer-close]",
    );

    expect(button?.getAttribute("aria-label")).toBe("Close");
  });
});
