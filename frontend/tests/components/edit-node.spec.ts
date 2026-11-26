import { RouterTestingHarness } from "@angular/router/testing";
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { projectA } from "../fixtures/models";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import {
  configureAppTestingModule,
  OutletStubComponent,
} from "../helpers/editor";
import { activeTab, tabLabels } from "../helpers/taiga";

const SECTIONS = ["script", "app", "environment", "catalog", "yaml"];

async function setup() {
  seedAuthorization(userPlain("owner"));
  const project = projectA();
  const node = project.pipeline.nodes.get("node_one");
  configureAppTestingModule([
    {
      path: "edit",
      component: EditNodeComponent,
      resolve: {
        project: () => project,
        node: () => ({ id: "node_one", node }),
      },
      children: [
        { path: "", component: OutletStubComponent },
        ...SECTIONS.map((path) => ({ path, component: OutletStubComponent })),
      ],
    },
  ]);
  const harness = await RouterTestingHarness.create();
  const open = async (url: string) => {
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return harness.fixture.nativeElement.querySelector("app-edit-node header");
  };
  return { harness, open };
}

describe("EditNodeComponent", () => {
  it("lists the node sections and marks Design at the node root", async () => {
    const page = await setup();

    const header = await page.open("/edit");

    expect(tabLabels(header)).toEqual([
      "Design",
      "Script",
      "App",
      "Environment",
      "Catalog",
      "YAML",
    ]);
    expect(activeTab(header)).toBe("Design");
  });

  it("marks the section the route opens", async () => {
    const page = await setup();

    const header = await page.open("/edit/script");

    expect(activeTab(header)).toBe("Script");
  });
});
