import { queues } from "app/queues";
import * as packages from "packages/node-packages";

queues.packages.checkUpdates.process(({ nodePackage }) =>
  packages.checkUpdates(nodePackage)
);
