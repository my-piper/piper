import { queues } from "app/queues";
import * as packages from "logic/node-packages";

queues.packages.checkUpdates.process(({ nodePackage }) =>
  packages.checkUpdates(nodePackage)
);
