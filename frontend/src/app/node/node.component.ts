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
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { NodeInputs, NodeOutputs } from "src/types/node";
import { Primitive } from "src/types/primitive";
import { createLogger } from "src/utils/logger";
import { NodeRunState } from "src/utils/launch-state";
import { UI } from "src/consts/ui";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { getLabel } from "src/utils/i18n";
import { deployRef } from "src/utils/deploy-node";
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

  private readonly language = inject(CURRENT_LANGUAGE);

  /** The pipeline the node is in: where its wired inputs come from. */
  @Input()
  pipeline: Pipeline | null = null;

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

  /** Asks to collapse (true) or expand (false) the node (#320). */
  @Output()
  collapse = new EventEmitter<boolean>();

  /** A wire was dropped on a collapsed node's input socket. */
  @Output()
  collapsedDrop = new EventEmitter<void>();

  @HostBinding("class.collapsed")
  get collapsed() {
    return !!this.node?.arrange?.collapsed;
  }

  /** The title's hover text; a Deploy node adds its `prefix/slug`. */
  get titleHint() {
    const ref = deployRef(this.node);
    return ref ? `${getLabel(this.node.title, this.language)} · ${ref}` : null;
  }

  /** How many inputs show on the node (sockets and widgets). */
  get featuredCount() {
    return [...this.node.inputs.values()].filter((i) => i.featured).length;
  }

  /** A collapsed node's output socket starts a wire from its first output. */
  get firstOutput(): string | null {
    return [...this.node.outputs.keys()].sort()[0] ?? null;
  }

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

  /**
   * Where a wired widget input gets its value: the upstream node's title, or
   * the pipeline input's; null when nothing is wired into it.
   */
  wiredFrom(row: WidgetRow): string | null {
    const flows = this.pipeline?.flows ?? new Map();
    for (const [, flow] of flows) {
      if (flow.to === this.id && flow.input === row.id) {
        const from = this.pipeline.nodes.get(flow.from);
        return getLabel(from?.title, this.language) ?? flow.from;
      }
    }
    for (const [key, input] of this.pipeline?.inputs ?? new Map()) {
      for (const [, flow] of input.flows ?? new Map()) {
        if (flow.to === this.id && flow.input === row.id) {
          return getLabel(input.title, this.language) ?? key;
        }
      }
    }
    return null;
  }

  textValue(row: WidgetRow): string {
    const value = this.widgetValue(row);
    return value === null ? "" : String(value);
  }

  /** A required input with nothing to run with. */
  isMissing(row: WidgetRow): boolean {
    return (
      !!row.input.required &&
      this.textValue(row) === "" &&
      this.wiredFrom(row) === null
    );
  }

  /** Text as typed; an emptied field falls back to the default. */
  setText(row: WidgetRow, text: string) {
    this.inputChange.emit({ input: row.id, value: text === "" ? null : text });
  }

  /** The choice shown, by its place in `enum`, or -1. */
  choiceIndex(row: WidgetRow): number {
    const value = this.widgetValue(row);
    return (row.input.enum ?? []).findIndex((option) => option === value);
  }

  /** `index` counts the list's options, the "—" one first when shown. */
  setChoice(row: WidgetRow, index: number) {
    const blank = !row.input.required || this.choiceIndex(row) < 0 ? 1 : 0;
    const option = row.input.enum?.[index - blank];
    this.inputChange.emit({ input: row.id, value: option ?? null });
  }

  toggleWidget(row: WidgetRow) {
    this.inputChange.emit({ input: row.id, value: !this.widgetValue(row) });
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
