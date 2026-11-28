import { Provider } from "@angular/core";
import { Observable, Subject } from "rxjs";
import {
  LaunchEvents,
  NodeEvent,
  NodeEventType,
} from "src/services/launch-events";
import { LaunchFeeds } from "src/services/launch-feeds";

/**
 * The Launch feed's event source for component specs, in place of the socket:
 * `emit` delivers a node event of a launch to the feeds listening to it.
 * The socket adapter itself is covered by `unit/services/launch-events.spec.ts`
 * and the editor specs.
 */
export class FakeLaunchEvents implements LaunchEvents {
  private readonly subjects = new Map<string, Subject<NodeEvent>>();
  private readonly counts = new Map<string, number>();

  of(launch: string): Observable<NodeEvent> {
    return new Observable<NodeEvent>((subscriber) => {
      this.counts.set(launch, this.listeners(launch) + 1);
      const subscription = this.subject(launch).subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        this.counts.set(launch, this.listeners(launch) - 1);
      };
    });
  }

  emit(launch: string, type: NodeEventType, node: string) {
    this.subject(launch).next({ type, node });
  }

  /** How many feeds listen to a launch (each joins its room once). */
  listeners(launch: string): number {
    return this.counts.get(launch) ?? 0;
  }

  /** How many feeds listen to any launch. */
  total(): number {
    return [...this.counts.values()].reduce((a, b) => a + b, 0);
  }

  private subject(launch: string) {
    let subject = this.subjects.get(launch);
    if (!subject) {
      subject = new Subject<NodeEvent>();
      this.subjects.set(launch, subject);
    }
    return subject;
  }
}

/**
 * The Launch feeds a launch view provides, on a fake event source: for specs
 * that render a node drawer or the logs without the canvas editor.
 */
export function provideFakeLaunchFeeds(
  events = new FakeLaunchEvents(),
): Provider[] {
  return [
    LaunchFeeds,
    { provide: FakeLaunchEvents, useValue: events },
    { provide: LaunchEvents, useValue: events },
  ];
}
