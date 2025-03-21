import { queues } from "../../app/queue";
import error from "./process-node-error";
import handler from "./process-node-handler";

queues.nodes.process.deferred.process(handler, error);
