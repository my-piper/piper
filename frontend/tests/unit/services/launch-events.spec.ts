import { TestBed } from "@angular/core/testing";
import { LAUNCH_ROOM } from "src/consts/rooms";
import { LaunchEvents, NodeEvent } from "src/services/launch-events";
import { LiveService } from "src/services/live.service";
import { LAUNCH_ID, SOCKET_EVENTS, userPlain } from "../../fixtures/plain";
import { provideTestConfig, seedAuthorization } from "../../helpers/config";
import { provideSocketDouble, SocketDouble } from "../../helpers/socket";

/**
 * Node events arrive in the launch room as `{ launch, node }` under the
 * backend's event names (backend/jobs/process-node/process-node-handler.ts).
 */
describe("LaunchEvents from the socket", () => {
  let events: LaunchEvents;
  let socket: SocketDouble;

  beforeEach(() => {
    seedAuthorization(userPlain("owner"));
    TestBed.configureTestingModule({
      providers: [provideTestConfig(), provideSocketDouble()],
    });
    TestBed.inject(LiveService);
    events = TestBed.inject(LaunchEvents);
    socket = TestBed.inject(SocketDouble);
  });

  it("maps the launch's node events by their wire names", () => {
    const received: NodeEvent[] = [];
    const subscription = events
      .of(LAUNCH_ID)
      .subscribe((e) => received.push(e));

    const wire = [
      "node_running",
      "node_done",
      "node_progress",
      "node_not_ready",
      "node_error",
      "node_flow",
      "node_reset",
      "node_gonna_repeat",
    ];
    wire.forEach((name) =>
      socket.receive(name, { launch: LAUNCH_ID, node: "node_one" }),
    );
    socket.receive("node_done", { launch: "launch_other", node: "node_one" });
    subscription.unsubscribe();

    expect(received.map((e) => e.type)).toEqual([
      "running",
      "done",
      "progress",
      "not_ready",
      "error",
      "flow",
      "reset",
      "repeat",
    ]);
    expect(received.every((e) => e.node === "node_one")).toBe(true);
  });

  it("joins the launch room while subscribed and leaves it after", () => {
    const subscription = events.of(LAUNCH_ID).subscribe();
    const joined = socket.emittedEvents(SOCKET_EVENTS.joinRoom);
    const listening = socket.listenerCount();

    subscription.unsubscribe();

    expect(joined).toEqual([LAUNCH_ROOM(LAUNCH_ID)]);
    expect(listening).toBeGreaterThan(0);
    expect(socket.listenerCount()).toBe(0);
    expect(socket.emittedEvents(SOCKET_EVENTS.leaveRoom)).toEqual([
      LAUNCH_ROOM(LAUNCH_ID),
    ]);
  });
});
