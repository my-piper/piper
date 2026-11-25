import { Component, signal } from "@angular/core";
import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import {
  provideRouter,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import {
  TUI_BREAKPOINT,
  TuiButton,
  TuiDataList,
  TuiDropdown,
  TuiIcon,
} from "@taiga-ui/core";
import { TuiBadge } from "@taiga-ui/kit";
import { TuiNavigation } from "@taiga-ui/layout";
import { AppLayoutComponent } from "src/app/layout/layout.component";
import { MeUserComponent } from "src/app/me-user/me-user.component";
import { SelectThemeComponent } from "src/app/select-theme/select-theme.component";
import { ASIDE_EXPANDED_KEY } from "src/consts/core";
import { Languages } from "src/enums/languages";
import { CanPipe } from "src/pipes/can";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { userPlain } from "../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../helpers/config";
import { provideSocketDouble } from "../helpers/socket";

@Component({ template: "<p>page</p>", standalone: true })
class PageStubComponent {}

type Breakpoint = "desktopLarge" | "desktopSmall" | "mobile";

describe("AppLayoutComponent", () => {
  async function render(
    kind: "owner" | "admin" = "owner",
    breakpoint: Breakpoint = "desktopLarge",
  ) {
    seedAuthorization(userPlain(kind));
    const viewport = signal<Breakpoint>(breakpoint);
    TestBed.configureTestingModule({
      declarations: [
        AppLayoutComponent,
        MeUserComponent,
        SelectThemeComponent,
        CanPipe,
      ],
      imports: [
        CommonModule,
        UiKitModule,
        RouterOutlet,
        ReactiveFormsModule,
        RouterLink,
        RouterLinkActive,
        TuiButton,
        TuiIcon,
        TuiBadge,
        ...TuiDataList,
        ...TuiDropdown,
        ...TuiNavigation,
      ],
      providers: [
        provideTestConfig(),
        provideSocketDouble(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: CURRENT_LANGUAGE, useValue: Languages.en },
        { provide: TUI_BREAKPOINT, useValue: viewport },
        provideRouter([
          {
            path: "",
            component: AppLayoutComponent,
            children: [
              { path: "projects", component: PageStubComponent },
              {
                path: "canvas",
                component: PageStubComponent,
                data: { fullBleed: true },
              },
            ],
          },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const controller = TestBed.inject(HttpTestingController);
    return { harness, controller, viewport };
  }

  async function open(harness: RouterTestingHarness, url: string) {
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return harness.fixture.nativeElement as HTMLElement;
  }

  function asideLabels(element: HTMLElement) {
    return Array.from(element.querySelectorAll("aside [tuiAsideItem]"))
      .filter((item) => item.hasAttribute("href"))
      .map((item) => item.textContent.trim());
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it("lists the global sections in the aside for a regular user", async () => {
    const { harness } = await render("owner");

    const element = await open(harness, "/projects");

    expect(asideLabels(element)).toEqual([
      "Pipelines",
      "Launches",
      "Assets",
      "Environment",
    ]);
  });

  it("adds the admin sections for an admin", async () => {
    const { harness } = await render("admin");

    const element = await open(harness, "/projects");

    expect(asideLabels(element)).toEqual([
      "Node packages",
      "Pipelines",
      "Launches",
      "Assets",
      "Environment",
      "Users",
    ]);
  });

  it("marks the section of the current route active", async () => {
    const { harness } = await render("owner");

    const element = await open(harness, "/projects");

    const active = element.querySelector("aside [tuiAsideItem]._active");
    expect(active?.textContent.trim()).toBe("Pipelines");
  });

  it("collapses the aside and remembers it", async () => {
    const { harness } = await render("owner");
    const element = await open(harness, "/projects");
    const aside = element.querySelector("aside");
    const expandedBefore = aside.classList.contains("_expanded");

    element
      .querySelector<HTMLButtonElement>("[data-testid=aside-toggle]")
      .click();
    harness.detectChanges();

    expect(expandedBefore).toBe(true);
    expect(aside.classList.contains("_expanded")).toBe(false);
    expect(localStorage.getItem(ASIDE_EXPANDED_KEY)).toBe("false");
  });

  it("starts collapsed when the aside was collapsed before", async () => {
    localStorage.setItem(ASIDE_EXPANDED_KEY, "false");
    const { harness } = await render("owner");

    const element = await open(harness, "/projects");

    expect(element.querySelector("aside").classList.contains("_expanded")).toBe(
      false,
    );
  });

  it("replaces the aside with a header drawer on mobile", async () => {
    const { harness } = await render("owner", "mobile");

    const element = await open(harness, "/projects");

    expect(element.querySelector("aside")).toBeNull();
    expect(
      element.querySelector("[data-testid=navigation-drawer]"),
    ).not.toBeNull();
  });

  it("closes the drawer after navigating", async () => {
    const { harness } = await render("owner", "mobile");
    await open(harness, "/projects");
    const component = harness.fixture.debugElement.query(
      (node) => node.componentInstance instanceof AppLayoutComponent,
    ).componentInstance as AppLayoutComponent;
    component.drawerOpen.set(true);

    await open(harness, "/canvas");

    expect(TestBed.inject(Router).url).toBe("/canvas");
    expect(component.drawerOpen()).toBe(false);
  });

  it("closes the drawer when the viewport leaves the mobile breakpoint", async () => {
    const { harness, viewport } = await render("owner", "mobile");
    await open(harness, "/projects");
    const component = harness.fixture.debugElement.query(
      (node) => node.componentInstance instanceof AppLayoutComponent,
    ).componentInstance as AppLayoutComponent;
    component.drawerOpen.set(true);

    viewport.set("desktopSmall");
    harness.detectChanges();
    viewport.set("mobile");
    harness.detectChanges();

    expect(component.drawerOpen()).toBe(false);
  });

  it("keeps the aside and no drawer on desktop", async () => {
    const { harness } = await render("owner", "desktopSmall");

    const element = await open(harness, "/projects");

    expect(element.querySelector("aside")).not.toBeNull();
    expect(element.querySelector("[data-testid=navigation-drawer]")).toBeNull();
  });

  it("shows the footer on content pages and hides it on full-bleed pages", async () => {
    const { harness } = await render("owner");

    const content = await open(harness, "/projects");
    const contentFooter = content.querySelector("[data-testid=app-footer]");
    const contentBleeds = content
      .querySelector("main")
      .classList.contains("full-bleed");
    const canvas = await open(harness, "/canvas");

    expect(contentFooter?.textContent).toContain("test footer");
    expect(contentBleeds).toBe(false);
    expect(canvas.querySelector("[data-testid=app-footer]")).toBeNull();
    expect(canvas.querySelector("main").classList.contains("full-bleed")).toBe(
      true,
    );
  });
});
