import "reflect-metadata";

import { queues } from "./app/queues";

await queues.nodes.process.deferred.close();
await queues.nodes.process.deferred.obliterate();

await queues.launches.outputs.set.close();
await queues.launches.outputs.set.obliterate();

await queues.launches.errors.set.close();
await queues.launches.errors.set.obliterate();

console.log("Done");

process.exit(0);
