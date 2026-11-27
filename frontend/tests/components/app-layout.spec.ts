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
  TuiDialog,
  TuiDropdown,
  TuiHint,
  TuiIcon,
} from "@taiga-ui/core";
import { TuiBadge } from "@taiga-ui/kit";
import { TuiNavigation } from "@taiga-ui/layout";
import { AppLayoutComponent } from "src/app/layout/layout.component";
import { MeUserComponent } from "src/app/me-user/me-user.component";
import { ConnectedAccountsComponent } from "src/app/connected-accounts/connected-accounts.component";
import { ErrorDialogComponent } from "src/app/error-dialog/error-dialog.component";
import { SelectThemeComponent } from "src/app/select-theme/select-theme.component";
import { Languages } from "src/enums/languages";
import { CanPipe } from "src/pipes/can";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { SharedModule } from "src/app/shared.module";
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
        SharedModule,
        RouterOutlet,
        ReactiveFormsModule,
        RouterLink,
        RouterLinkActive,
        TuiButton,
        TuiIcon,
        TuiBadge,
        ...TuiDataList,
        ...TuiDropdown,
        ...TuiHint,
        ...TuiNavigation,
        TuiDialog,
        ErrorDialogComponent,
        ConnectedAccountsComponent,
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

  function sidebar(element: HTMLElement) {
    return element.querySelector("[data-testid=app-sidebar]");
  }

  function sidebarLabels(element: HTMLElement) {
    return Array.from(sidebar(element).querySelectorAll("a.item")).map((item) =>
      item.getAttribute("aria-label"),
    );
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it("lists the global sections in the sidebar for a regular user", async () => {
    const { harness } = await render("owner");

    const element = await open(harness, "/projects");

    expect(sidebarLabels(element)).toEqual([
      "Pipelines",
      "Launches",
      "Assets",
      "Environment",
    ]);
  });

  it("adds the admin sections for an admin", async () => {
    const { harness } = await render("admin");

    const element = await open(harness, "/projects");

    expect(sidebarLabels(element)).toEqual([
      "Node packages",
      "Pipelines",
      "Launches",
      "Assets",
      "Environment",
      "Users",
    ]);
  });

  it("marks the section of the current route active and names it in the top bar", async () => {
    const { harness } = await render("owner");

    const element = await open(harness, "/projects");

    const active = sidebar(element).querySelector("a.item.active");
    expect(active?.getAttribute("aria-label")).toBe("Pipelines");
    expect(
      element.querySelector("[data-testid=app-crumbs] b")?.textContent,
    ).toBe("Pipelines");
  });

  it("names no section in the top bar outside the global sections", async () => {
    const { harness } = await render("owner");

    const element = await open(harness, "/canvas");

    expect(element.querySelector("[data-testid=app-crumbs] b")).toBeNull();
  });

  it("puts the mark first, linked to the site, and the theme menu last", async () => {
    const { harness } = await render("owner");

    const element = await open(harness, "/projects");

    const items = Array.from(sidebar(element).children);
    expect(items[0].getAttribute("data-testid")).toBe("app-logo");
    expect(items[0].getAttribute("href")).toBeTruthy();
    expect(items.at(-1).getAttribute("data-testid")).toBe("theme-menu");
  });

  it("replaces the sidebar with a top bar drawer on mobile", async () => {
    const { harness } = await render("owner", "mobile");

    const element = await open(harness, "/projects");

    expect(sidebar(element)).toBeNull();
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

  it("keeps the sidebar and no drawer on desktop", async () => {
    const { harness } = await render("owner", "desktopSmall");

    const element = await open(harness, "/projects");

    expect(sidebar(element)).not.toBeNull();
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
