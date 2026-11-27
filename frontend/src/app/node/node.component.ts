import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  Output,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { catchError, filter, map, of } from "rxjs";
import { PipelineEvent } from "src/models/events";
import { Launch } from "src/models/launch";
import {
  Node,
  NodeInput,
  NodeOutput,
  NodeProgress,
  NodeStatus,
} from "src/models/node";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { NodeInputs, NodeOutputs } from "src/types/node";
import { Primitive } from "src/types/primitive";
import { createLogger } from "src/utils/logger";
import { NodeRunState } from "src/utils/launch-state";
import { UI } from "src/consts/ui";
import { toInstance } from "src/utils/models";
import { nodeLayout, NodeLayout, WidgetRow } from "src/utils/node-layout";
import { parseNumber, stepNumber } from "src/utils/number-widget";
import { LAUNCH_ROOM } from "src/consts/rooms";

@Component({
  selector: "app-node",
  templateUrl: "./node.component.html",
  styleUrls: ["./node.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeComponent implements OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  private _launch!: Launch;
  private _id!: string;

  logger: ReturnType<typeof createLogger>;

  /** The output whose "Pick artefact" dialog is open. */
  pickOpen: string | null = null;
  /** The port menu open on this node: `input:<id>` or `output:<key>`. */
  openMenu: string | null = null;

  @Input()
  set id(id: string) {
    this.logger = createLogger(id);
    this._id = id;
  }
  get id() {
    return this._id;
  }

  @Input()
  @HostBinding("class.disabled")
  disabled = false;

  @HostBinding("class.done")
  @Input()
  get hasDone() {
    return this.status?.state === "done";
  }

  @HostBinding("class.error")
  @Input()
  get hasError() {
    return this.status?.state === "error";
  }

  @Input()
  project!: Project;

  @Input()
  node!: Node;

  readonly rowHeight = UI.node.input.height;

  /** Where the featured inputs sit: socket rows, then widget rows. */
  get layout(): NodeLayout {
    return nodeLayout(this.node);
  }

  @HostBinding("style.min-height.px")
  @Input()
  get height() {
    return this.layout.height;
  }

  @Input()
  set launch(launch: Launch) {
    this.logger.debug("Set launch", launch?._id || "-");
    if (launch) {
      if (this._launch?._id !== launch?._id) {
        this._launch = launch;
        this.reset();
        this.load();
        this.listen();
      }
    } else {
      this._launch = null;
      this.reset();
      this.silent();
    }
  }

  get launch() {
    return this._launch;
  }

  @Input()
  inputs!: NodeInputs;

  @Input()
  outputs!: NodeOutputs;

  status!: NodeStatus;
  progress!: NodeProgress;

  @Output()
  takeOutInput = new EventEmitter<{
    node: {
      id: string;
      node: Node;
    };
    input: {
      id: string;
      input: NodeInput;
    };
  }>();

  @Output()
  takeOutOutput = new EventEmitter<{
    node: {
      id: string;
      node: Node;
    };
    output: {
      id: string;
      output: NodeOutput;
    };
  }>();

  @HostBinding("attr.data-exec")
  get execution() {
    return this.node?.execution;
  }

  /** Array ports (`image[]`, …) draw a hollow socket. */
  isArray(type: string | undefined) {
    return !!type?.endsWith("[]");
  }

  @HostBinding("class.running")
  get running() {
    return this.status?.state === "running";
  }

  /** Retry is offered on a failed node only where it can be run again. */
  @Input()
  retryable = false;

  /** The node's run state, emitted when it changes (`null`: no launch). */
  @Output()
  stateChange = new EventEmitter<NodeRunState | null>();

  @Output()
  retry = new EventEmitter<void>();

  /** A widget changed an input's value; `null` clears it to the default. */
  @Output()
  inputChange = new EventEmitter<{ input: string; value: Primitive | null }>();

  @Output()
  showLog = new EventEmitter<void>();

  @Output()
  input = new EventEmitter<string>();

  @Output()
  output = new EventEmitter<string>();

  @Output()
  done = new EventEmitter<NodeOutputs>();

  @Output()
  setOutput = new EventEmitter<{ output: string; value: Primitive }>();

  subscriptions: { launch: () => void } = { launch: null };

  timers: { status: ReturnType<typeof setTimeout> | null } = { status: null };

  constructor(
    private socket: Socket,
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private live: LiveService,
  ) {}

  ngOnDestroy(): void {
    this.subscriptions.launch?.();
    this.silent();
  }

  private listen() {
    this.silent();

    this.logger.debug("Listen node events");

    this.subscriptions.launch = this.live.subscribe(
      LAUNCH_ROOM(this.launch._id),
    );
    this.listenEvents();
    this.checkStatus();
  }

  private listening = false;

  /** Socket listeners filter by the current launch, so they are set up once. */
  private listenEvents() {
    if (this.listening) {
      return;
    }
    this.listening = true;

    this.socket
      .fromEvent<object>("node_running")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const { launch, node } = toInstance(data, PipelineEvent);
        if (launch === this.launch?._id && node === this.id) {
          this.logger.debug("Node is running");
          this.checkStatus();
        }
      });

    this.socket
      .fromEvent<object>("node_done")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          this.logger.debug("Node done");
          this.checkStatus();
        }
      });

    this.socket
      .fromEvent<object>("node_progress")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          this.logger.debug("Progress");
          this.loadProgress();
        }
      });

    this.socket
      .fromEvent<object>("node_not_ready")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          this.logger.debug("Node is waiting for its inputs");
          this.setStatus(this.status, "waiting");
          this.cd.detectChanges();
        }
      });

    this.socket
      .fromEvent<object>("node_error")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          this.logger.debug("Node error");
          this.checkStatus();
        }
      });

    this.socket
      .fromEvent<object>("node_flow")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data: object) => {
        const { launch, node } = plainToInstance(PipelineEvent, data as object);
        if (launch === this.launch?._id && node === this.id) {
          this.logger.debug("Node is going to flow");
          this.setStatus(this.status, "queued");
          this.load();
        }
      });

    this.socket
      .fromEvent<object>("node_reset")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          this.logger.debug(`Node is reset ${node}`);
          this.loadInputs();
        }
      });
  }

  silent() {
    this.logger.debug("Silent");
    this.subscriptions.launch?.();
    clearTimeout(this.timers.status);
  }

  reset() {
    this.setStatus(null);
    this.progress = null;
    this.cd.detectChanges();
  }

  /** Set by flow events until the node's backend status catches up. */
  private pending: "queued" | "waiting" | null = null;

  private get runState(): NodeRunState | null {
    return this.pending ?? this.status?.state ?? null;
  }

  /** The parent hears about changes after this change detection pass. */
  private setStatus(
    status: NodeStatus | null,
    pending: "queued" | "waiting" | null = null,
  ) {
    const prev = this.runState;
    [this.status, this.pending] = [status, pending];
    const next = this.runState;
    if (prev !== next) {
      queueMicrotask(() => this.stateChange.emit(next));
    }
  }

  /** The value a widget shows: the launch request's, else the default. */
  widgetValue({ id, input }: WidgetRow): Primitive | null {
    return this.inputs?.[id] ?? input.default ?? null;
  }

  numberText(row: WidgetRow): string {
    const value = this.widgetValue(row);
    return value === null || value === "" ? "" : String(value);
  }

  stepWidget(row: WidgetRow, direction: 1 | -1) {
    const current = Number(this.widgetValue(row));
    this.inputChange.emit({
      input: row.id,
      value: stepNumber(isNaN(current) ? null : current, direction, row.input),
    });
  }

  /** Typed text; text that is not a number puts the old value back. */
  typeNumber(row: WidgetRow, field: HTMLInputElement) {
    const value = parseNumber(field.value, row.input);
    if (value === undefined) {
      field.value = this.numberText(row);
      return;
    }
    this.inputChange.emit({ input: row.id, value });
  }

  pinFrom(output: string) {
    this.output.emit(output);
  }

  pinTo(input: string) {
    this.input.emit(input);
  }

  private load() {
    this.logger.debug("Load node state");
    this.loadInputs();
    this.loadOutputs().subscribe((outputs) => {
      this.outputs = outputs;
      this.cd.detectChanges();
    });
  }

  private loadInputs() {
    this.http
      .get(`launches/${this.launch._id}/${this.id}/inputs`)
      .subscribe((inputs) => {
        this.inputs = inputs as NodeInputs;
        this.cd.detectChanges();
      });
  }

  private loadOutputs() {
    return this.http.get(`launches/${this.launch._id}/${this.id}/outputs`).pipe(
      catchError(() => of(null)),
      map((obj) => obj as NodeOutputs),
    );
  }

  private checkStatus() {
    clearTimeout(this.timers.status);

    const check = () => {
      this.logger.debug("Check status");
      this.loadStatus().subscribe((status) => {
        this.setStatus(status);
        this.cd.detectChanges();

        switch (status.state) {
          case "running":
            this.loadProgress();
            this.timers.status = setTimeout(check, 2000);
            break;
          case "done":
            this.loadOutputs().subscribe((outputs) => {
              this.outputs = outputs;
              this.cd.detectChanges();

              this.logger.debug("Node done");
              this.done.emit(outputs);
            });
            break;
          case "error":
            break;
          default:
        }
      });
    };

    check();
  }

  private loadStatus() {
    return this.http.get(`launches/${this.launch._id}/${this.id}/status`).pipe(
      filter((json) => !!json),
      map((json) => plainToInstance(NodeStatus, json)),
    );
  }

  private loadProgress() {
    this.http
      .get(`launches/${this.launch._id}/${this.id}/progress`)
      .pipe(
        filter((json) => !!json),
        map((json) => plainToInstance(NodeProgress, json)),
      )
      .subscribe((progress) => {
        this.progress = progress;
        this.cd.detectChanges();
      });
  }

  emitTakeOutInput(key: string, input: NodeInput) {
    this.openMenu = null;
    this.takeOutInput.emit({
      input: { id: key, input },
      node: { id: this.id, node: this.node },
    });
  }

  emitTakeOutOutput(key: string, output: NodeOutput) {
    this.openMenu = null;
    this.takeOutOutput.emit({
      output: {
        id: key,
        output,
      },
      node: { id: this.id, node: this.node },
    });
  }

  pickArtefact(output: string, artefact: string) {
    this.setOutput.emit({ output, value: artefact });
    this.pickOpen = null;
  }
}
