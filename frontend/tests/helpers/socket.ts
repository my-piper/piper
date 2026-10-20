import { Provider } from "@angular/core";
import { Socket } from "ngx-socket-io";
import { Observable, Subject } from "rxjs";

/**
 * Controllable replacement for ngx-socket-io's Socket. Every instance owns
 * fresh Subjects, so a new double per spec gives fully isolated event state.
 */
export class SocketDouble {
  readonly emitted: { event: string; payload: unknown }[] = [];

  private readonly subjects = new Map<string, Subject<unknown>>();
  private readonly listeners = new Map<string, number>();

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
  }

  fromEvent<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      this.listeners.set(event, (this.listeners.get(event) || 0) + 1);
      const subscription = this.subject(event).subscribe((payload) =>
        subscriber.next(payload as T),
      );
      return () => {
        subscription.unsubscribe();
        this.listeners.set(event, this.listeners.get(event) - 1);
      };
    });
  }

  /** Delivers a server event to every current `fromEvent` subscriber. */
  receive(event: string, payload: unknown) {
    this.subject(event).next(payload);
  }

  /** Number of open `fromEvent` subscriptions for an event (or all events). */
  listenerCount(event?: string): number {
    if (event !== undefined) {
      return this.listeners.get(event) || 0;
    }
    return Array.from(this.listeners.values()).reduce((a, b) => a + b, 0);
  }

  emittedEvents(event: string): unknown[] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.payload);
  }

  private subject(event: string): Subject<unknown> {
    let subject = this.subjects.get(event);
    if (!subject) {
      subject = new Subject<unknown>();
      this.subjects.set(event, subject);
    }
    return subject;
  }
}

export function provideSocketDouble(socket = new SocketDouble()): Provider[] {
  return [
    { provide: SocketDouble, useValue: socket },
    { provide: Socket, useValue: socket },
  ];
}
