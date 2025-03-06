import { createLogger } from "./logger";
import "./app/io";
import { queues } from "./app/queue";
import "./jobs/minion";
import "./jobs/notify";
import "./jobs/process-node";

const logger = createLogger("clean");

logger.debug("Obliterate minions");
await queues.minions.obliterate();

logger.debug("Obliterate nodes");
await queues.nodes.obliterate();

logger.debug("Obliterate notifies");
await queues.notifies.obliterate();
