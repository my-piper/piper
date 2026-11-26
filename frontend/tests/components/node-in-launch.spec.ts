import { RouterTestingHarness } from "@angular/router/testing";
import { NodeInLaunchComponent } from "src/app/node-in-launch/node-in-launch.component";
import { launch, projectA } from "../fixtures/models";
import { userPlain } from "../fixtures/plain";
import { seedAuthorization } from "../helpers/config";
import {
  configureAppTestingModule,
  OutletStubComponent,
} from "../helpers/editor";
import { activeTab, tabLabels } from "../helpers/taiga";

const SECTIONS = ["inputs", "outputs", "state", "logs", "jobs"];

async function setup() {
  seedAuthorization(userPlain("owner"));
  const node = projectA().pipeline.nodes.get("node_one");
  configureAppTestingModule([
    {
      path: "node",
      component: NodeInLaunchComponent,
      resolve: {
        launch: () => launch(),
        node: () => ({ id: "node_one", node }),
      },
      children: SECTIONS.map((path) => ({
        path,
        component: OutletStubComponent,
      })),
    },
  ]);
  const harness = await RouterTestingHarness.create();
  return async (url: string) => {
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return harness.fixture.nativeElement.querySelector(
      "app-node-in-launch header",
    );
  };
}

describe("NodeInLaunchComponent", () => {
  it("lists the launch sections of the node", async () => {
    const open = await setup();

    const header = await open("/node/inputs");

    expect(tabLabels(header)).toEqual([
      "Inputs",
      "Outputs",
      "State",
      "Logs",
      "Jobs",
    ]);
    expect(activeTab(header)).toBe("Inputs");
  });

  it("marks the section the route opens", async () => {
    const open = await setup();

    const header = await open("/node/logs");

    expect(activeTab(header)).toBe("Logs");
  });
});
