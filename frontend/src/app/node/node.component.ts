import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  Output,
  ChangeDetectionStrategy,
  inject,
} from "@angular/core";
import { Subscription } from "rxjs";
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
import { LaunchFeeds, NodeFeed } from "src/services/launch-feeds";
import { NodeInputs, NodeOutputs } from "src/types/node";
import { Primitive } from "src/types/primitive";
import { createLogger } from "src/utils/logger";
import { UI } from "src/consts/ui";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { getLabel } from "src/utils/i18n";
import { deployRef } from "src/utils/deploy-node";
import {
  nodeLayout,
  NodeLayout,
  snapWidth,
  WidgetRow,
} from "src/utils/node-layout";
import { parseNumber, stepNumber } from "src/utils/number-widget";

@Component({
  selector: "app-node",
  templateUrl: "./node.component.html",
  styleUrls: ["./node.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeComponent implements OnDestroy {
  private readonly feeds = inject(LaunchFeeds);
  private readonly cd = inject(ChangeDetectorRef);

  private _launch!: Launch;
  /** The node's live state in the launch it shows, from the Launch feed. */
  private feed: NodeFeed | null = null;
  private doneSubscription: Subscription | null = null;
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
        this.watch();
      }
    } else {
      this._launch = null;
      this.unwatch();
    }
  }

  get launch() {
    return this._launch;
  }

  /**
   * Marks a node the pipeline starts at: `auto` for an Auto start node in
   * the editor, `launch` for a node the shown launch started from (#356).
   */
  @Input()
  startMark: "auto" | "launch" | null = null;

  get startLabel() {
    return this.startMark === "launch"
      ? $localize`:@@label.started_here:Started here`
      : $localize`:@@label.auto_start:Auto start`;
  }

  /** The inputs the launch request gives, shown until the launch has its own. */
  @Input("inputs")
  requestInputs!: NodeInputs;

  /** The outputs to show without a launch, or until the launch has its own. */
  @Input("outputs")
  requestOutputs!: NodeOutputs;

  get inputs(): NodeInputs {
    const inputs = this.feed?.inputs();
    return inputs !== undefined ? inputs : this.requestInputs;
  }

  get outputs(): NodeOutputs | null {
    const outputs = this.feed?.outputs();
    return outputs !== undefined ? outputs : this.requestOutputs;
  }

  get status(): NodeStatus | null {
    return this.feed?.status() ?? null;
  }

  get progress(): NodeProgress | null {
    return this.feed?.progress() ?? null;
  }

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

  /** The node's tint (#337): its title bar and border take it. */
  @HostBinding("attr.data-color")
  get color() {
    return this.node?.arrange?.color ?? null;
  }

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

  @Output()
  retry = new EventEmitter<void>();

  /**
   * Widths while the right edge is dragged (#321): `done` on release, when
   * the canvas saves. A double-click on the edge sends the default width.
   * Not named `resize`: a `(resize)` binding also catches the DOM's resize
   * events bubbling up from inside the node.
   */
  @Output()
  widthChange = new EventEmitter<{ width: number; done: boolean }>();

  /** The width shown beside the edge while it is dragged. */
  resizing: number | null = null;

  @HostBinding("class.resizing")
  get isResizing() {
    return this.resizing !== null;
  }

  @HostBinding("style.width.px")
  get width() {
    return this.node?.arrange?.w || UI.node.width;
  }

  /** Drags the right edge: px are divided by the canvas zoom, then snapped. */
  startResize(event: PointerEvent) {
    if (this.disabled || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const host = handle.closest("app-node") as HTMLElement;
    const zoom = host.getBoundingClientRect().width / host.offsetWidth || 1;
    const [startX, startWidth] = [event.clientX, this.width];
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser doesn't track (synthetic): moves still arrive.
    }

    const move = (e: PointerEvent) => {
      const width = snapWidth(startWidth + (e.clientX - startX) / zoom);
      if (width !== this.resizing) {
        this.resizing = width;
        this.widthChange.emit({ width, done: false });
      }
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      if (this.resizing !== null) {
        this.widthChange.emit({ width: this.resizing, done: true });
      }
      this.resizing = null;
      this.cd.detectChanges();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  resetWidth(event: MouseEvent) {
    event.stopPropagation();
    if (!this.disabled) {
      this.widthChange.emit({ width: UI.node.width, done: true });
    }
  }

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

  ngOnDestroy(): void {
    this.unwatch();
  }

  /** Reads the node's state in the launch from the Launch feed. */
  private watch() {
    this.unwatch();
    this.logger.debug("Watch node", this.launch._id);
    this.feed = this.feeds.watch(this.launch._id, this.id);
    this.doneSubscription = this.feed.done.subscribe((outputs) => {
      this.logger.debug("Node done");
      this.done.emit(outputs);
    });
  }

  private unwatch() {
    this.doneSubscription?.unsubscribe();
    this.feed?.release();
    [this.feed, this.doneSubscription] = [null, null];
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
