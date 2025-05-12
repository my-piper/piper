import { queues } from "app/queues";
import * as packages from "logic/node-packages";

queues.packages.update.process(({ nodePackage }) =>
  packages.uploadPackage(nodePackage)
);
