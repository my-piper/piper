import { queues } from "app/queues";
import error from "./process-node-error";
import handler from "./process-node-handler";

queues.nodes.process.protracted.process(handler, error);
