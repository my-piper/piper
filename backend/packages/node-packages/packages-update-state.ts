import { queues } from "app/queues";
import { PACKAGES_UPDATES } from "consts/packages";
import { loadRange } from "core-kit/packages/redis";
import {
  NodePackageUpdates,
  NodePackageUpdatesState,
} from "models/node-package";

export async function getPackagesUpdateState(): Promise<NodePackageUpdatesState> {
  return new NodePackageUpdatesState({
    status: await (async () => {
      {
        const { planned } = await queues.packages.checkUpdates.getState();
        if (planned > 0) {
          return "checking";
        }
      }

      {
        const { planned } = await queues.packages.update.getState();
        if (planned > 0) {
          return "updating";
        }
      }

      return null;
    })(),
    updates: await (async () => {
      const packages = await loadRange(PACKAGES_UPDATES, NodePackageUpdates);
      for (const p of packages) {
        delete p.updated?.nodes;
      }
      return packages;
    })(),
  });
}
