import { queues } from "./app/queue";

console.log(await queues.nodes.getState());

await queues.nodes.clean();
