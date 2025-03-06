import { queues } from "../app/queue";
import * as packages from "../logic/node-packages";

queues.packages.update.process(({ nodePackage }) =>
  packages.uploadPackage(nodePackage)
);
