import { inject, Injectable } from "@angular/core";
import { Socket } from "ngx-socket-io";
import { filter, map, merge, Observable } from "rxjs";
import { LAUNCH_ROOM } from "src/consts/rooms";
import { PipelineEvent } from "src/models/events";
import { LiveService } from "src/services/live.service";
import { toInstance } from "src/utils/models";

/**
 * The socket events a launch room carries about its nodes, as `{ launch,
 * node }` (backend `notify()` calls in jobs/), by the name the feed uses.
 */
const NODE_EVENTS = {
  node_running: "running",
  node_done: "done",
  node_progress: "progress",
  node_not_ready: "not_ready",
  node_error: "error",
  node_flow: "flow",
  node_reset: "reset",
  node_gonna_repeat: "repeat",
} as const;

export type NodeEventType = (typeof NODE_EVENTS)[keyof typeof NODE_EVENTS];

/** Something happened to one node of a launch. */
export interface NodeEvent {
  type: NodeEventType;
  node: string;
}

/** Node events of one launch from the socket, in the launch's room. */
@Injectable({ providedIn: "root" })
export class SocketLaunchEvents implements LaunchEvents {
  private readonly socket = inject(Socket);
  private readonly live = inject(LiveService);

  of(launch: string): Observable<NodeEvent> {
    return new Observable<NodeEvent>((subscriber) => {
      const leave = this.live.subscribe(LAUNCH_ROOM(launch));
      const events = Object.entries(NODE_EVENTS).map(([name, type]) =>
        this.socket.fromEvent<object>(name).pipe(
          map((data) => toInstance(data, PipelineEvent)),
          filter((event) => event.launch === launch),
          map(({ node }) => ({ type, node })),
        ),
      );
      const subscription = merge(...events).subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        leave();
      };
    });
  }
}

/**
 * Where the Launch feed hears about node events: the socket in the app, a
 * fake in component tests (`tests/helpers/launch-events.ts`).
 */
@Injectable({ providedIn: "root", useExisting: SocketLaunchEvents })
export abstract class LaunchEvents {
  /** The node events of a launch while subscribed. */
  abstract of(launch: string): Observable<NodeEvent>;
}
