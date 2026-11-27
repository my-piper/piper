import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  Data,
  provideRouter,
  Router,
  RouterOutlet,
} from "@angular/router";
import { provideTaiga, TuiRoot } from "@taiga-ui/core";
import { RoutedDialogComponent } from "src/app/routed-dialog/routed-dialog.component";

/**
 * app-routed-dialog (#348) shows the host route's children in a tuiDialog:
 * open while a child is active, labelled by the child's data.dialogLabel,
 * sized by the host unless the child sets data.dialogSize,
 * and closing navigates back to the host, keeping the query on request.
 */

@Component({
  selector: "app-test-root",
  imports: [TuiRoot, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: "<tui-root><router-outlet /></tui-root>",
})
class RootComponent {}

@Component({
  selector: "app-test-host",
  imports: [RoutedDialogComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<app-routed-dialog
    size="m"
    [dismissible]="dismissible"
    [keepQuery]="keepQuery"
    (activate)="activated.push($event)"
  />`,
})
class HostComponent {
  dismissible = true;
  keepQuery = false;
  activated: unknown[] = [];
}

@Component({
  selector: "app-test-child",
  changeDetection: ChangeDetectionStrategy.Eager,
  template: "<p>{{ name }}</p>",
})
class ChildComponent {
  name = inject(ActivatedRoute).snapshot.paramMap.get("name") ?? "new";
}

let fixture: ComponentFixture<RootComponent>;
let router: Router;

const dialog = () => document.querySelector("tui-dialog");
const label = () => dialog()?.querySelector("header h2")?.textContent.trim();

function host(): HostComponent {
  return fixture.debugElement.query(
    (d) => d.componentInstance instanceof HostComponent,
  ).componentInstance;
}

function render() {
  fixture.detectChanges();
}

async function setup(
  url: string,
  { dismissible = true, keepQuery = false } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      provideTaiga(),
      provideRouter([
        {
          path: "items",
          component: HostComponent,
          children: [
            {
              path: "add",
              component: ChildComponent,
              data: { dialogLabel: "Add item" },
            },
            {
              path: "short",
              component: ChildComponent,
              data: { dialogLabel: "Short form", dialogSize: "s" },
            },
            {
              path: ":name",
              component: ChildComponent,
              data: {
                dialogLabel: ({ name }: Data) => `Edit item: ${name}`,
              },
              resolve: { name: () => "resolved" },
            },
          ],
        },
      ]),
    ],
  });
  fixture = TestBed.createComponent(RootComponent);
  router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  render();
  host().dismissible = dismissible;
  host().keepQuery = keepQuery;
  render();
}

describe("RoutedDialogComponent", () => {
  it("stays closed while no child route is active", async () => {
    await setup("/items");

    render();

    expect(dialog()).toBeNull();
    expect(host().activated).toEqual([]);
  });

  it("opens on a child route with the route's label and content", async () => {
    await setup("/items/add");

    await expect
      .poll(() => {
        render();
        return dialog()?.textContent;
      })
      .toContain("new");

    expect(label()).toBe("Add item");
    expect(dialog().getAttribute("data-size")).toBe("m");
    expect(host().activated[0]).toBeInstanceOf(ChildComponent);
  });

  it("takes the child's data.dialogSize over the host's size", async () => {
    await setup("/items/short");

    await expect
      .poll(() => {
        render();
        return dialog()?.getAttribute("data-size");
      })
      .toBe("s");
    expect(label()).toBe("Short form");
  });

  it("labels the dialog from the child's resolved data", async () => {
    await setup("/items/a");
    await expect
      .poll(() => {
        render();
        return label();
      })
      .toBe("Edit item: resolved");

    await router.navigateByUrl("/items/add");
    render();

    await expect
      .poll(() => {
        render();
        return label();
      })
      .toBe("Add item");
  });

  for (const [keepQuery, url] of [
    [false, "/items"],
    [true, "/items?tag=image"],
  ] as const) {
    it(`returns to the host route on close, ${keepQuery ? "keeping" : "dropping"} the query`, async () => {
      await setup("/items/add?tag=image", { keepQuery });
      await expect
        .poll(() => {
          render();
          return dialog();
        })
        .toBeTruthy();

      dialog().querySelector<HTMLElement>("button[tuiButtonX]").click();

      await expect
        .poll(() => {
          render();
          return router.url;
        })
        .toBe(url);
      await expect
        .poll(() => {
          render();
          return dialog();
        })
        .toBeNull();
    });
  }

  it("ignores Escape when not dismissible", async () => {
    await setup("/items/add", { dismissible: false });
    await expect
      .poll(() => {
        render();
        return dialog();
      })
      .toBeTruthy();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    render();

    expect(router.url).toBe("/items/add");
    expect(dialog()).not.toBeNull();
  });
});
