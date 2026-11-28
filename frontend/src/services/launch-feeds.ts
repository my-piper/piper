import {
  computed,
  inject,
  Injectable,
  OnDestroy,
  signal,
  Signal,
} from "@angular/core";
import { plainToInstance } from "class-transformer";
import {
  catchError,
  filter,
  map,
  Observable,
  of,
  Subject,
  Subscription,
} from "rxjs";
import { NodeProgress, NodeStatus } from "src/models/node";
import { HttpService } from "src/services/http.service";
import {
  LaunchEvents,
  NodeEvent,
  NodeEventType,
} from "src/services/launch-events";
import { NodeInputs, NodeOutputs } from "src/types/node";
import {
  LaunchGraph,
  LaunchState,
  launchState,
  NodeRunState,
} from "src/utils/launch-state";

/** How often a running node's status is checked. */
const STATUS_POLL = 2000;

/** The live state of one node of a launch, while it is watched. */
export interface NodeFeed {
  readonly launch: string;
  readonly node: string;
  /** The backend status; null until loaded (or the node has none yet). */
  readonly status: Signal<NodeStatus | null>;
  readonly progress: Signal<NodeProgress | null>;
  /** The status, or `queued`/`waiting` from flow events until it catches up. */
  readonly state: Signal<NodeRunState | null>;
  /** `undefined` until loaded. */
  readonly inputs: Signal<NodeInputs | undefined>;
  /** `undefined` until loaded; null when the node has none or failed. */
  readonly outputs: Signal<NodeOutputs | null | undefined>;
  /** The outputs, each time a status check finds the node done. */
  readonly done: Observable<NodeOutputs>;
  /** Stops watching; the last release stops the node's loads and polling. */
  release(): void;
}

/** One launch's events and the run states of its watched nodes. */
export interface LaunchFeed {
  readonly launch: string;
  /** Run states of the watched nodes that have one, by node id. */
  readonly states: Signal<Readonly<Record<string, NodeRunState>>>;
  /** The states each time one changes, as the change arrives. */
  readonly changes: Observable<Readonly<Record<string, NodeRunState>>>;
  /** The launch state of `graph` from the watched nodes (launch-state.ts). */
  launchState(graph: LaunchGraph): LaunchState | null;
  /** The launch's node events, of one node and of the given types. */
  events(
    node?: string | null,
    types?: readonly NodeEventType[],
  ): Observable<NodeEvent>;
  /** Stops listening; the last release leaves the launch room. */
  release(): void;
}

/**
 * The Launch feed: one module per launch that listens to its node events,
 * loads and polls the state of the nodes someone watches and works out the
 * launch state. The Node card, the node drawers, the logs and the canvas
 * editor read from it instead of the socket. Provided by the launch view
 * (the canvas editor), so its drawers share the feeds of its cards.
 */
@Injectable()
export class LaunchFeeds implements OnDestroy {
  private readonly http = inject(HttpService);
  private readonly source = inject(LaunchEvents);

  private readonly channels = new Map<string, Channel>();

  /** Listens to a launch until the returned feed is released. */
  open(launch: string): LaunchFeed {
    const channel = this.channel(launch);
    channel.refs++;
    return lease(channel.feed, () => this.release(channel));
  }

  /** Watches a node of a launch until the returned feed is released. */
  watch(launch: string, node: string): NodeFeed {
    const channel = this.channel(launch);
    channel.refs++;
    const tracker = channel.track(node);
    return lease(tracker.feed, () => {
      channel.untrack(tracker);
      this.release(channel);
    });
  }

  /** A launch's node events (of one node, of the given types) while subscribed. */
  events(
    launch: string,
    node?: string | null,
    types?: readonly NodeEventType[],
  ): Observable<NodeEvent> {
    return new Observable<NodeEvent>((subscriber) => {
      const feed = this.open(launch);
      const subscription = feed.events(node, types).subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        feed.release();
      };
    });
  }

  /** The feed of a launch someone listens to, without holding it. */
  peek(launch: string): LaunchFeed | null {
    return this.channels.get(launch)?.feed ?? null;
  }

  ngOnDestroy() {
    this.channels.forEach((channel) => channel.close());
    this.channels.clear();
  }

  private channel(launch: string) {
    let channel = this.channels.get(launch);
    if (!channel) {
      channel = new Channel(launch, this.http, this.source);
      this.channels.set(launch, channel);
    }
    return channel;
  }

  private release(channel: Channel) {
    if (--channel.refs <= 0 && this.channels.get(channel.launch) === channel) {
      channel.close();
      this.channels.delete(channel.launch);
    }
  }
}

/** A copy of a feed whose `release` works once. */
function lease<T extends { release(): void }>(feed: T, release: () => void): T {
  let released = false;
  return {
    ...feed,
    release: () => {
      if (!released) {
        released = true;
        release();
      }
    },
  };
}

class Channel {
  refs = 0;

  private readonly states = signal<Readonly<Record<string, NodeRunState>>>({});
  private readonly events$ = new Subject<NodeEvent>();
  private readonly changes$ = new Subject<Record<string, NodeRunState>>();
  private readonly trackers = new Map<string, Tracker>();
  private readonly subscription: Subscription;

  readonly feed: LaunchFeed;

  constructor(
    readonly launch: string,
    private readonly http: HttpService,
    source: LaunchEvents,
  ) {
    const states = this.states.asReadonly();
    const events$ = this.events$;
    this.feed = {
      launch,
      states,
      changes: this.changes$.asObservable(),
      launchState: (graph) => launchState(graph, states()),
      events: (node = null, types) =>
        events$.pipe(
          filter(
            (e) =>
              (!node || e.node === node) && (!types || types.includes(e.type)),
          ),
        ),
      release: () => {},
    };
    this.subscription = source.of(launch).subscribe((event) => {
      this.trackers.get(event.node)?.handle(event.type);
      this.events$.next(event);
    });
  }

  track(node: string) {
    let tracker = this.trackers.get(node);
    if (!tracker) {
      tracker = new Tracker(this.launch, node, this.http, (state) =>
        this.publish(node, state),
      );
      this.trackers.set(node, tracker);
      tracker.start();
    }
    tracker.refs++;
    return tracker;
  }

  untrack(tracker: Tracker) {
    if (--tracker.refs > 0 || this.trackers.get(tracker.node) !== tracker) {
      return;
    }
    tracker.stop();
    this.trackers.delete(tracker.node);
    if (tracker.feed.state() !== null) {
      // Released from an input setter or a destroy hook: the state goes after
      // the current change detection pass, like it arrived.
      queueMicrotask(() =>
        this.publish(
          tracker.node,
          this.trackers.get(tracker.node)?.feed.state() ?? null,
        ),
      );
    }
  }

  close() {
    this.subscription.unsubscribe();
    this.events$.complete();
    this.changes$.complete();
    this.trackers.forEach((tracker) => tracker.stop());
    this.trackers.clear();
  }

  private publish(node: string, state: NodeRunState | null) {
    const states = this.states();
    if ((states[node] ?? null) === state) {
      return;
    }
    const next = { ...states };
    if (state) {
      next[node] = state;
    } else {
      delete next[node];
    }
    this.states.set(next);
    this.changes$.next(next);
  }
}

/** Loads one node's state and follows its events while it is watched. */
class Tracker {
  refs = 0;

  private readonly status = signal<NodeStatus | null>(null);
  /** Set by flow events until the node's backend status catches up. */
  private readonly pending = signal<"queued" | "waiting" | null>(null);
  private readonly progress = signal<NodeProgress | null>(null);
  private readonly inputs = signal<NodeInputs | undefined>(undefined);
  private readonly outputs = signal<NodeOutputs | null | undefined>(undefined);
  private readonly done$ = new Subject<NodeOutputs>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  readonly feed: NodeFeed;

  constructor(
    readonly launch: string,
    readonly node: string,
    private readonly http: HttpService,
    private readonly published: (state: NodeRunState | null) => void,
  ) {
    const state = computed(
      () => this.pending() ?? this.status()?.state ?? null,
    );
    this.feed = {
      launch,
      node,
      status: this.status.asReadonly(),
      progress: this.progress.asReadonly(),
      state,
      inputs: this.inputs.asReadonly(),
      outputs: this.outputs.asReadonly(),
      done: this.done$.asObservable(),
      release: () => {},
    };
  }

  start() {
    this.loadInputs();
    this.loadOutputs();
    this.checkStatus();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.done$.complete();
  }

  handle(type: NodeEventType) {
    switch (type) {
      case "running":
      case "done":
      case "error":
        this.checkStatus();
        break;
      case "progress":
        this.loadProgress();
        break;
      case "not_ready":
        this.setStatus(this.status(), "waiting");
        break;
      case "flow":
        this.setStatus(this.status(), "queued");
        this.loadInputs();
        this.loadOutputs();
        break;
      case "reset":
        this.loadInputs();
        break;
      default:
    }
  }

  private setStatus(
    status: NodeStatus | null,
    pending: "queued" | "waiting" | null = null,
  ) {
    const prev = this.feed.state();
    this.status.set(status);
    this.pending.set(pending);
    const next = this.feed.state();
    if (prev !== next) {
      this.published(next);
    }
  }

  private url(path: string) {
    return `launches/${this.launch}/${this.node}/${path}`;
  }

  private loadInputs() {
    this.http.get(this.url("inputs")).subscribe((inputs) => {
      if (!this.stopped) {
        this.inputs.set(inputs as NodeInputs);
      }
    });
  }

  private loadOutputs(then?: (outputs: NodeOutputs) => void) {
    this.http
      .get(this.url("outputs"))
      .pipe(
        catchError(() => of(null)),
        map((obj) => obj as NodeOutputs),
      )
      .subscribe((outputs) => {
        if (!this.stopped) {
          this.outputs.set(outputs);
          then?.(outputs);
        }
      });
  }

  private checkStatus() {
    clearTimeout(this.timer);

    const check = () => {
      this.http
        .get(this.url("status"))
        .pipe(
          filter((json) => !!json),
          map((json) => plainToInstance(NodeStatus, json)),
        )
        .subscribe((status) => {
          if (this.stopped) {
            return;
          }
          this.setStatus(status);

          switch (status.state) {
            case "running":
              this.loadProgress();
              this.timer = setTimeout(check, STATUS_POLL);
              break;
            case "done":
              this.loadOutputs((outputs) => this.done$.next(outputs));
              break;
            default:
          }
        });
    };

    check();
  }

  private loadProgress() {
    this.http
      .get(this.url("progress"))
      .pipe(
        filter((json) => !!json),
        map((json) => plainToInstance(NodeProgress, json)),
      )
      .subscribe((progress) => {
        if (!this.stopped) {
          this.progress.set(progress);
        }
      });
  }
}
