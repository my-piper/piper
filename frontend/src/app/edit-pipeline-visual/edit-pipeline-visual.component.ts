import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  ChangeDetectionStrategy,
  inject,
  DestroyRef,
  DOCUMENT,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Location } from "@angular/common";
import { ActivatedRoute, Router, RouterOutlet } from "@angular/router";
import { TuiDialogService } from "@taiga-ui/core";
import { TUI_CONFIRM, type TuiConfirmData } from "@taiga-ui/kit";
import { assign, escape, isEmpty, mapValues, random } from "lodash";
import { customAlphabet } from "nanoid";
import { Socket } from "ngx-socket-io";
import { stringify } from "qs";
import {
  delay,
  filter,
  finalize,
  map,
  Subscription,
  switchMap,
  take,
} from "rxjs";
import { canvasShortcut, isEditable } from "src/utils/canvas-shortcuts";
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { UI, UI_DELAY } from "src/consts/ui";
import { SelectArea } from "src/directives/canvas-select.directive";
import {
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_STEP,
} from "src/directives/pitch-zoom.directive";
import { AppConfig } from "src/models/app-config";
import { Arrange } from "src/models/arrange";
import { PipelineEvent } from "src/models/events";
import { InputFlow } from "src/models/input-flow";
import { Launch } from "src/models/launch";
import { LaunchRequest, NodeToLaunch } from "src/models/launch-request";
import {
  Node,
  NodeInput,
  NodeOutput,
  SCRIPT_NODE_SOURCE,
} from "src/models/node";
import { FlowTransformer, NodeFlow } from "src/models/node-flow";
import { OutputFlow } from "src/models/output-flow";
import {
  Layout,
  Pipeline,
  PipelineInput,
  PipelineOutput,
} from "src/models/pipeline";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { Ajv } from "src/providers/ajv";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { MeManager } from "src/services/me.service";
import { ProjectManager } from "src/services/project.manager";
import { NodeOutputs } from "src/types/node";
import { Point } from "src/types/point";
import { Primitive } from "src/types/primitive";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { getLabel } from "src/utils/i18n";
import { sid } from "src/utils/string";
import { mapTo, toInstance, toPlain } from "src/utils/models";
import * as YAML from "yaml";
import { AssistantComponent } from "../assistant/assistant.component";
import { EditNodeInputsComponent } from "../edit-node-inputs/edit-node-inputs.component";
import { LaunchLogsComponent } from "../launch-logs/launch-logs.component";
import { SelectNodeComponent } from "../select-node/select-node.component";
import { USER_ROOM } from "src/consts/rooms";

/** `node:<id>` → [`node`, `<id>`]; ids may contain colons. */
function splitKey(key: string): [string, string] {
  const at = key.indexOf(":");
  return [key.slice(0, at), key.slice(at + 1)];
}

function salt() {
  return customAlphabet("1234567890abcdef", 5)();
}

@Component({
  selector: "app-edit-pipeline-visual",
  templateUrl: "./edit-pipeline-visual.component.html",
  styleUrls: ["./edit-pipeline-visual.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditPipelineVisualComponent implements OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly language = inject(CURRENT_LANGUAGE);

  private readonly dialogs = inject(TuiDialogService);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  userRole = UserRole;
  scriptNodeSource = SCRIPT_NODE_SOURCE;
  ui = UI;
  zoom = { min: MIN_SCALE, max: MAX_SCALE, step: ZOOM_STEP };
  selectNodeComponent = SelectNodeComponent;
  editNodeComponent = EditNodeComponent;
  editNodeInputsComponent = EditNodeInputsComponent;
  launchLogsComponent = LaunchLogsComponent;

  progress: {
    launching: boolean;
    interrupting: boolean;
    nodes: {
      launching: {
        [key: string]: boolean;
      };
    };
  } = { launching: false, interrupting: false, nodes: { launching: {} } };
  error: Error;

  launch!: Launch;
  /** On the launch page: the Launch may still run, so it can be stopped. */
  running = false;
  launches: {
    [key: string]: Launch;
  } = {};

  modal!: EditNodeComponent | SelectNodeComponent | null;

  drawlers: {
    left: SelectNodeComponent | null;
    right: EditNodeComponent | null;
    bottom: AssistantComponent | null;
  } = { left: null, right: null, bottom: null };

  state: "default" | "flow" = "default";
  subscriptions: Subscription[] = [];

  mode: "project" | "launch" | "scheme" = "project";

  project!: Project;
  pipeline!: Pipeline;
  launchRequest!: LaunchRequest;
  currentNode!: Node;

  /**
   * Nodes, inputs and outputs picked with the marquee or Shift/Cmd + click,
   * keyed `node:<id>`, `input:<id>` or `output:<id>`; they move together.
   */
  selection = new Set<string>();
  private selectionBase = new Set<string>();

  flow: { type: "node" | "input"; from?: string; output?: string } | null =
    null;
  mouse: { x: number; y: number } | null = null;

  @ViewChild("drawlerRight", { static: true })
  drawlerRight!: RouterOutlet;

  @ViewChild("nodesRef")
  nodesRef!: ElementRef<HTMLDivElement>;

  @ViewChild("paneRef")
  paneRef!: ElementRef<HTMLElement>;

  @ViewChild("gridRef")
  gridRef!: ElementRef<SVGRectElement>;

  constructor(
    private projectManager: ProjectManager,
    public config: AppConfig,
    private route: ActivatedRoute,
    private http: HttpService,
    private ajv: Ajv,
    private router: Router,
    private live: LiveService,
    private me: MeManager,
    private socket: Socket,
    private cd: ChangeDetectorRef,
    private location: Location,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, launch, launches, mode }) => {
      [
        this.project,
        this.pipeline,
        this.launchRequest,
        this.launch,
        this.launches,
        this.mode,
      ] = [
        project || launch.project,
        project?.pipeline || launch.pipeline,
        project?.launchRequest || launch.launchRequest,
        launch,
        launches || {},
        mode || "project",
      ];
      this.running = this.mode === "launch";

      if (this.mode === "project" && this.pipeline.nodes.size <= 0) {
        setTimeout(() => {
          this.router.navigate([{ outlets: { left: ["add-node"] } }], {
            relativeTo: this.route,
          });
        }, 500);
      }
    });

    this.drawlerRight.activateEvents
      .pipe(
        map(() => this.drawlerRight.activatedRoute),
        filter(({ component }) => component === EditNodeInputsComponent),
        switchMap(({ data }) => data),
      )
      .subscribe(({ node: { node } }) => (this.currentNode = node));

    this.drawlerRight.deactivateEvents.subscribe(() => {
      this.currentNode = null;
      this.cd.detectChanges();
    });

    this.listen();
  }

  private listen() {
    const release = this.live.subscribe(USER_ROOM(this.me.user._id));
    this.destroyRef.onDestroy(release);
    this.socket
      .fromEvent<object>("pipeline_done")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const { launch } = toInstance(data, PipelineEvent);
        if (this.running && launch === this.launch._id) {
          this.running = false;
          this.cd.detectChanges();
        }
      });
  }

  back() {
    this.router.navigate([{ outlets: { primary: [] } }], {
      relativeTo: this.route,
    });
  }

  ngOnDestroy() {
    this.unsubscribe();
  }

  private unsubscribe() {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  itemMoving(key: string, arrange: Point, { x, y }: Point) {
    if (!this.selection.has(key)) {
      this.selection.clear();
    }
    this.moveSelection(key, arrange, { x, y });
    this.cd.detectChanges();
  }

  itemMoved(key: string, arrange: Point, { x, y }: Point) {
    this.moveSelection(key, arrange, { x, y });
    this.save();
  }

  /** Moves the dragged item and shifts the other selected items along. */
  private moveSelection(key: string, arrange: Point, { x, y }: Point) {
    const [dx, dy] = [x - arrange.x, y - arrange.y];
    assign(arrange, { x, y });
    for (const other of this.selection) {
      const position = other !== key ? this.arrangeOf(other) : null;
      if (position) {
        assign(position, { x: position.x + dx, y: position.y + dy });
      }
    }
  }

  /** Canvas position of a selected item by its selection key. */
  private arrangeOf(key: string): Point | undefined {
    const [type, id] = splitKey(key);
    const { nodes, inputs, outputs } = this.pipeline;
    const items = { node: nodes, input: inputs, output: outputs }[type] as
      | Map<string, { arrange: Point }>
      | undefined;
    return items?.get(id)?.arrange;
  }

  startAreaSelection() {
    this.selectionBase = new Set(this.selection);
  }

  /** Selects items touched by the marquee on top of those picked before it. */
  selectArea({ left, top, right, bottom }: SelectArea) {
    const selection = new Set(this.selectionBase);
    const elements =
      this.paneRef.nativeElement.querySelectorAll<HTMLElement>("[data-pick]");
    for (const element of Array.from(elements)) {
      const rect = element.getBoundingClientRect();
      if (
        rect.left < right &&
        rect.right > left &&
        rect.top < bottom &&
        rect.bottom > top
      ) {
        selection.add(element.dataset["pick"]);
      }
    }
    this.selection = selection;
    this.cd.detectChanges();
  }

  toggleSelection(id: string) {
    if (this.selection.has(id)) {
      this.selection.delete(id);
    } else {
      this.selection.add(id);
    }
    this.cd.detectChanges();
  }

  /** Shift/Cmd + click on a pipeline input or output toggles it. */
  togglePick(event: MouseEvent, key: string) {
    const target = event.target as HTMLElement;
    if (
      this.mode === "project" &&
      (event.shiftKey || event.metaKey || event.ctrlKey) &&
      !target.closest("a, button, input, textarea, select")
    ) {
      this.toggleSelection(key);
    }
  }

  clearSelection() {
    if (this.selection.size > 0) {
      this.selection.clear();
      this.cd.detectChanges();
    }
  }

  @HostListener("document:keydown.escape")
  escape() {
    this.clearSelection();
  }

  /** The keyboard shortcuts overlay, opened with `?`. */
  shortcutsOpen = false;

  /**
   * Canvas shortcuts (`canvasShortcut`). Only presses on the canvas or the
   * page itself count: fields, drawers and dialogs keep their keys.
   */
  @HostListener("document:keydown", ["$event"])
  shortcut(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const onCanvas =
      target === this.document.body ||
      (!!target && this.host.nativeElement.contains(target));
    if (!onCanvas || isEditable(target) || target?.closest("tui-dialog")) {
      return;
    }
    const editing = this.mode === "project";
    switch (canvasShortcut(event)) {
      case "delete":
        if (editing && this.selection.size > 0) {
          event.preventDefault();
          this.confirmRemoveSelection();
        }
        break;
      case "select-all":
        if (editing) {
          event.preventDefault();
          this.selectAll();
        }
        break;
      case "launch":
        if (
          editing &&
          !this.progress.launching &&
          isEmpty(this.launches) &&
          this.pipeline.nodes.size > 0
        ) {
          event.preventDefault();
          this.run();
        }
        break;
      case "help":
        event.preventDefault();
        this.shortcutsOpen = true;
        this.cd.detectChanges();
        break;
    }
  }

  selectAll() {
    const { nodes, inputs, outputs } = this.pipeline;
    this.selection = new Set([
      ...[...nodes.keys()].map((id) => `node:${id}`),
      ...[...(inputs?.keys() ?? [])].map((id) => `input:${id}`),
      ...[...(outputs?.keys() ?? [])].map((id) => `output:${id}`),
    ]);
    this.cd.detectChanges();
  }

  /** Deletes the selected nodes, inputs and outputs after one confirmation. */
  confirmRemoveSelection() {
    const keys = [...this.selection];
    if (keys.length === 1) {
      const [type, id] = splitKey(keys[0]);
      if (type === "node" && this.pipeline.nodes.has(id)) {
        this.confirmRemoveNode(id, this.pipeline.nodes.get(id));
      } else if (type === "input") {
        this.confirmRemoveInput(id);
      } else if (type === "output") {
        this.confirmRemoveOutput(id);
      }
      return;
    }
    const count = keys.length;
    this.confirmRemove(
      $localize`:@@message.confirm_delete_selection:Delete ${count}:count: selected items? Their connections are deleted too.`,
    ).subscribe(() => {
      for (const key of keys) {
        const [type, id] = splitKey(key);
        if (type === "node" && this.pipeline.nodes.has(id)) {
          this.removeNode(id);
        } else if (type === "input" && this.pipeline.inputs?.has(id)) {
          this.removeInput(id);
        } else if (type === "output" && this.pipeline.outputs?.has(id)) {
          this.removeOutput(id);
        }
      }
    });
  }

  private save() {
    this.projectManager.markDirty();
  }

  run() {
    if (this.pipeline.start.nodes.length === 0) {
      this.dialogs
        .open(
          $localize`:@@message.select_start_node:Enable Auto start for at least one node before launching.`,
          {
            label: $localize`:@@message.no_start_node:No start node selected`,
            size: "s",
          },
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe();
      return;
    }

    // Opened in the click itself: browsers block tabs opened after a request.
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
    }
    let opened = false;

    this.progress.launching = true;
    this.cd.detectChanges();

    const request = toInstance(
      {
        options: {
          bucket: "outputs",
        },
      },
      LaunchRequest,
    );

    this.projectManager.status
      .pipe(
        filter((status) => [null, "saved", "error"].includes(status)),
        take(1),
        // A failed save is shown by the project; the Launch is abandoned.
        filter((status) => status !== "error"),
        switchMap(() =>
          this.http.post(
            `projects/${this.project._id}/launch`,
            toPlain(request),
          ),
        ),
        delay(UI_DELAY),
        finalize(() => {
          this.progress.launching = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, Launch)),
      )
      .subscribe({
        next: (launch) => {
          opened = true;
          this.openLaunch(launch, tab);
        },
        error: (err) => (this.error = err),
      })
      .add(() => {
        if (!opened) {
          tab?.close();
        }
      });
  }

  /** Shows a started Launch in its tab, or here when the tab was blocked. */
  private openLaunch({ _id }: Launch, tab: Window | null) {
    const commands = ["/launches", _id];
    if (!tab) {
      this.router.navigate(commands);
      return;
    }
    const url = this.router.serializeUrl(this.router.createUrlTree(commands));
    tab.location.href = this.location.prepareExternalUrl(url);
  }

  interrupt() {
    this.progress.interrupting = true;
    this.cd.detectChanges();

    this.http
      .post(`launches/${this.launch._id}/interrupt`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.interrupting = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.running = false;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  runNode(node: string) {
    this.progress.nodes.launching[node] = true;
    this.cd.detectChanges();

    const request = toInstance(
      {
        options: {
          bucket: "outputs",
        },
        inclusive: {
          nodes: [node],
        },
      },
      LaunchRequest,
    );

    this.projectManager.kick();
    this.projectManager.status
      .pipe(
        filter((status) => status === null || status === "saved"),
        take(1),
        switchMap(() =>
          this.http.post(
            `projects/${this.project._id}/launch`,
            toPlain(request),
          ),
        ),
        delay(UI_DELAY),
        finalize(() => {
          this.progress.nodes.launching[node] = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, Launch)),
      )
      .subscribe({
        next: (launch) => {
          this.launches[node] = launch;
          this.cd.detectChanges();

          this.saveUrlState();
        },
        error: (err) => (this.error = err),
      });
  }

  stopNode(node: string) {
    delete this.launches[node];
    this.cd.detectChanges();

    this.saveUrlState();
  }

  saveUrlState() {
    const params: { [key: string]: string } = {};
    if (!isEmpty(this.launches)) {
      const launches = mapValues(this.launches, (l) => l._id);
      const qs = stringify(launches, { delimiter: "," }).replace(/=/g, ":");
      assign(params, { launches: qs });
    }

    this.router.navigate([params], {
      relativeTo: this.route,
    });
  }

  fillNodeOutputs(node: string, outputs: NodeOutputs) {
    console.log("Fill node outputs", node);

    let nodeToLaunch = this.launchRequest.nodes.get(node);
    if (!nodeToLaunch) {
      nodeToLaunch = mapTo({}, NodeToLaunch);
      this.launchRequest.nodes.set(node, nodeToLaunch);
    }

    nodeToLaunch.outputs = mapTo({ outputs }, NodeToLaunch).outputs;

    this.projectManager.markDirty();

    delete this.launches[node];
    this.cd.detectChanges();

    this.saveUrlState();
  }

  addNode(left: number, top: number, payload: { node: string }) {
    if ("node" in payload) {
      this.closeDrawler();

      this.http
        .get(`nodes/${payload.node}`)
        .pipe(
          delay(UI_DELAY),
          finalize(() => {
            this.cd.detectChanges();
          }),
          map((obj) => toInstance(obj as object, Node)),
        )
        .subscribe({
          next: (node) => {
            const id = `${node._id}_${sid()}`;
            this.pipeline.nodes.set(id, node);
            if (this.pipeline.start.nodes.length <= 0) {
              this.pipeline.start.nodes.push(id);
            }
            assign(node.arrange, { x: left, y: top });
            this.save();
          },
          error: (err) => (this.error = err),
        });
    }
  }

  addInput(id: string, input: PipelineInput) {
    if (!this.pipeline.inputs) {
      this.pipeline.inputs = new Map<string, PipelineInput>();
    }

    const exists = !!this.pipeline.inputs.get(id);
    const key = !exists ? id : `${id}_${sid()}`;

    this.pipeline.inputs.set(key, input);
    const value = input.default;
    if (value !== undefined && value !== null) {
      this.launchRequest.inputs ??= new Map<string, Primitive>();
      this.launchRequest.inputs.set(key, value);
    }
    this.save();
    this.cd.detectChanges();
  }

  addOutput(id: string, output: PipelineOutput) {
    if (!this.pipeline.outputs) {
      this.pipeline.outputs = new Map<string, PipelineOutput>();
    }

    const exists = !!this.pipeline.outputs.get(id);
    const key = !exists ? id : `${id}_${sid()}`;
    this.pipeline.outputs.set(key, output);
    this.save();
    this.cd.detectChanges();
  }

  startNodeFlow(from: string, output: string) {
    this.flow = { type: "node", from, output };
    this.state = "flow";
  }

  startInputFlow(input: string) {
    this.flow = { type: "input", from: input };
    this.state = "flow";
  }

  @HostListener("document:mousemove", ["$event"])
  move(event: MouseEvent) {
    if (this.state === "flow") {
      const { nativeElement } = this.nodesRef;
      const rect = nativeElement.getBoundingClientRect();
      let x = Math.floor(event.clientX - rect.left);
      let y = Math.floor(event.clientY - rect.top);
      x += nativeElement.scrollLeft;
      y += nativeElement.scrollTop;
      this.mouse = { x, y };
    }
  }

  @HostListener("document:mouseup")
  stopMove() {
    if (this.state === "flow") {
      this.state = "default";
      [this.flow, this.mouse] = [null, null];
    }
  }

  addNodeFlow(from: string, output: string, to: string, input: string) {
    const o = this.pipeline.nodes.get(from).outputs.get(output);
    const i = this.pipeline.nodes.get(to).inputs.get(input);

    const flow = mapTo(
      {
        from,
        output,
        to,
        input,
      },
      NodeFlow,
    );

    switch (o.type) {
      case "json":
        switch (i.type) {
          case "string":
          case "integer":
          case "float":
          case "boolean":
            assign(flow, {
              transformer: mapTo({ type: "json" }, FlowTransformer),
            });
            break;
          default:
            console.log(o.schema, ">", i.schema?.id);
            if (i.type !== "json" || o.schema !== i.schema?.id) {
              return;
            }
        }

        break;
      case "image":
        switch (i.type) {
          case "image":
            break;
          case "image[]":
            assign(flow, {
              transformer: mapTo({ type: "array", index: 0 }, FlowTransformer),
            });
            break;
          default:
            return;
        }
        break;
      case "image[]":
        switch (i.type) {
          case "image":
            assign(flow, {
              transformer: mapTo({ type: "array", index: 0 }, FlowTransformer),
            });
            break;
          case "image[]":
            break;
          default:
            return;
        }
        break;
      default:
        if (o.type !== i.type) {
          return;
        }
    }

    const key = `${from}_to_${to}_${salt()}`;
    this.pipeline.flows.set(key, flow);
    this.save();
  }

  addInputFlow(from: string, to: string, input: string) {
    const o = this.pipeline.inputs.get(from);
    const i = this.pipeline.nodes.get(to).inputs.get(input);

    if (o.type !== i.type) {
      return;
    }

    const key = `to_${to}_${input}_${salt()}`;
    o.flows.set(
      key,
      mapTo(
        {
          to,
          input,
        },
        InputFlow,
      ),
    );
    this.save();
  }

  addFlow(to: string, input: string) {
    const { type, from, output } = this.flow;

    switch (type) {
      case "node":
        this.addNodeFlow(from, output, to, input);
        break;
      case "input":
        this.addInputFlow(from, to, input);
        break;
    }

    [this.state, this.mouse] = ["default", null];
  }

  editNode(node: string) {
    this.router.navigate(
      [{ outlets: { primary: ["nodes", node, "edit", "script"] } }],
      { relativeTo: this.route },
    );
  }

  confirmRemoveNode(id: string, node: Node) {
    this.confirmRemove(
      $localize`:@@message.confirm_delete_node:Delete node «${escape(getLabel(node.title, this.language))}:title:»? Its connections are deleted too.`,
    ).subscribe(() => this.removeNode(id));
  }

  confirmRemoveInput(input: string) {
    this.confirmRemove(
      $localize`:@@message.confirm_delete_pipeline_input:Delete pipeline input «${escape(input)}:input:»? Its connections are deleted too.`,
    ).subscribe(() => this.removeInput(input));
  }

  confirmRemoveOutput(output: string) {
    this.confirmRemove(
      $localize`:@@message.confirm_delete_pipeline_output:Delete pipeline output «${escape(output)}:output:»? Its connections are deleted too.`,
    ).subscribe(() => this.removeOutput(output));
  }

  /** `content` is HTML (TUI_CONFIRM binds it to innerHTML): escape values. */
  private confirmRemove(content: string) {
    return this.dialogs
      .open<boolean>(TUI_CONFIRM, {
        label: $localize`:@@message.confirm_delete:Delete?`,
        size: "s",
        data: {
          content,
          yes: $localize`:@@action.delete:Delete`,
          no: $localize`:@@action.cancel:Cancel`,
          appearance: ["primary-destructive", "secondary"],
        } satisfies TuiConfirmData,
      })
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef));
  }

  removeFlow(id: string) {
    this.pipeline.flows.delete(id);
    this.cd.detectChanges();
    this.save();
  }

  removeInputFlow(input: string, flow: string) {
    this.pipeline.inputs.get(input).flows.delete(flow);

    this.cd.detectChanges();
    this.save();
  }

  removeOutputFlow(output: string, flow: string) {
    this.pipeline.outputs.get(output).flows.delete(flow);
    this.cd.detectChanges();
    this.save();
  }

  removeOutput(output: string) {
    this.pipeline.outputs.delete(output);
    this.selection.delete(`output:${output}`);
    this.cd.detectChanges();
    this.save();
  }

  removeInput(input: string) {
    this.pipeline.inputs.delete(input);
    this.selection.delete(`input:${input}`);

    this.cd.detectChanges();
    this.save();
  }

  removeNode(node: string) {
    const { nodes, flows, inputs, outputs, start } = this.pipeline;
    nodes.delete(node);
    this.selection.delete(`node:${node}`);

    // Drop references now: the template resolves flow ends through the
    // `node` pipe, which throws for unknown nodes before sanitation runs.
    for (const [id, flow] of flows) {
      if (flow.from === node || flow.to === node) {
        flows.delete(id);
      }
    }
    for (const [, input] of inputs || []) {
      for (const [id, flow] of input.flows || []) {
        if (flow.to === node) {
          input.flows.delete(id);
        }
      }
    }
    for (const [, output] of outputs || []) {
      for (const [id, flow] of output.flows || []) {
        if (flow.from === node) {
          output.flows.delete(id);
        }
      }
    }
    start.nodes = start.nodes.filter((id) => id !== node);

    this.save();

    this.closeDrawler();
  }

  trackNode(index: number, { key, value }: { key: string; value: Node }) {
    return [key, value.version | 0].join("_");
  }

  takeOutPipelineInput({
    input,
    node,
  }: {
    input: { id: string; input: NodeInput };
    node: { id: string; node: Node };
  }) {
    const {
      title,
      description,
      type,
      icon,
      required,
      multiline,
      min,
      max,
      step,
      placeholder,
      freeform,
    } = input.input;

    this.pipeline.inputs ??= new Map<string, PipelineInput>();
    const flows = new Map<string, InputFlow>();
    flows.set(
      `to_${node.id}`,
      new InputFlow({
        to: node.id,
        input: input.id,
      }),
    );

    const { x, y } = node.node.arrange;

    let id = input.id;
    if (this.pipeline.inputs.has(id)) {
      id = `${id}_${sid(2)}`;
    }

    this.pipeline.inputs.set(
      id,
      new PipelineInput({
        title,
        description,
        type,
        icon,
        required,
        multiline,
        min,
        max,
        step,
        placeholder,
        default: input.input.default,
        enum: input.input.enum,
        freeform,
        flows,
        arrange: new Arrange({
          x: x - 100,
          y: y,
        }),
      }),
    );
    this.cd.detectChanges();
    this.save();
  }

  takeOutPipelineOutput({
    output,
    node,
  }: {
    output: { id: string; output: NodeOutput };
    node: { id: string; node: Node };
  }) {
    const { title, type } = output.output;

    this.pipeline.outputs ??= new Map<string, PipelineOutput>();
    const flows = new Map<string, OutputFlow>();
    flows.set(
      `from_${node.id}`,
      new OutputFlow({
        from: node.id,
        output: output.id,
      }),
    );

    const { x, y } = node.node.arrange;

    let id = output.id;
    if (this.pipeline.outputs.has(id)) {
      id = `${id}_${sid(2)}`;
    }

    this.pipeline.outputs.set(
      id,
      new PipelineOutput({
        title,
        type,
        flows,
        arrange: new Arrange({
          x: x + UI.node.width + 100,
          y: y + 10,
        }),
      }),
    );
    this.cd.detectChanges();
    this.save();
  }

  /**
   * A click on a canvas node: in project mode a modifier click toggles the
   * node in the selection (elsewhere it is ignored); a plain click clears the selection and opens the node's
   * drawer, or closes it when the node is already open. Clicks on empty
   * canvas space are handled by `clickOnGrid`.
   */
  clickOnNode(event: MouseEvent, id: string, node: Node) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select")) {
      return;
    }

    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      if (this.mode === "project") {
        this.toggleSelection(`node:${id}`);
      }
      return;
    }
    this.clearSelection();

    if (this.currentNode !== node) {
      const launch = this.launches[id] || this.launch;
      if (launch) {
        this.router.navigate(
          [
            {
              outlets: {
                right:
                  this.mode === "project"
                    ? ["launches", launch._id, "nodes", id]
                    : ["nodes", id],
                left: null,
              },
            },
          ],
          {
            relativeTo: this.route,
          },
        );
      } else {
        this.router.navigate(
          [{ outlets: { right: ["nodes", id], left: null } }],
          {
            relativeTo: this.route,
          },
        );
      }
    } else {
      this.closeDrawler();
    }
  }

  setNodeOutput(node: string, output: string, value: Primitive) {
    const { nodes } = this.launchRequest;
    let nodeToLaunch = nodes.get(node);
    if (!nodeToLaunch) {
      nodeToLaunch = mapTo({}, NodeToLaunch);
      nodes.set(node, nodeToLaunch);
    }

    nodeToLaunch.outputs ??= new Map<string, Primitive>();
    nodeToLaunch.outputs.set(output, value);

    this.cd.detectChanges();
    this.projectManager.markDirty();
  }

  /**
   * A click on empty canvas space. Panning captures the pointer on the
   * scroll container, so the click lands there rather than on the grid.
   */
  @HostListener("click", ["$event"])
  clickOnGrid(event: MouseEvent) {
    const empty: (Element | null)[] = [
      this.gridRef.nativeElement,
      this.gridRef.nativeElement.ownerSVGElement,
      this.paneRef.nativeElement,
      this.nodesRef.nativeElement,
    ];
    if (empty.includes(event.target as Element)) {
      this.clearSelection();
      this.closeDrawler();
    }
  }

  closeDrawler() {
    this.router.navigate([{ outlets: { left: null, right: null } }], {
      relativeTo: this.route,
    });
  }

  updateLayoutPosition({ left, top }: { left: number; top: number }) {
    this.pipeline.layout ??= new Layout();
    assign(this.pipeline.layout, { left, top });
    this.save();
  }

  updateLayoutZoom(zoom: number) {
    this.pipeline.layout ??= new Layout();
    assign(this.pipeline.layout, { zoom });
    this.save();
  }

  @HostListener("document:paste", ["$event"])
  async paste(event: ClipboardEvent) {
    let clipboardItems: Array<ClipboardItem | File> = [];

    if (typeof navigator?.clipboard?.read === "function") {
      try {
        clipboardItems = await navigator.clipboard.read();
      } catch (error) {
        console.error("Failed to read from clipboard", error);
        return;
      }
    } else if (event.clipboardData?.files) {
      clipboardItems = Array.from(event.clipboardData.files);
    }

    for (const item of clipboardItems) {
      if (item instanceof ClipboardItem) {
        for (const type of item.types) {
          switch (type) {
            case "text/plain": {
              const blob = await item.getType(type);
              const text = await blob.text();
              try {
                const data = YAML.parse(text) as object;
                const validate = this.ajv.compile(SCHEMAS.node);
                if (validate(data)) {
                  const node = toInstance(
                    {
                      ...data,
                      arrange: {
                        x: random(100, 400),
                        y: random(100, 200),
                      },
                    },
                    Node,
                  );
                  const id = [node._id || "imported", sid()].join("_");
                  this.pipeline.nodes.set(id, node);
                } else {
                  const { errors } = validate;
                  console.error(errors);
                }
              } catch (e) {
                console.error(e);
              }
              break;
            }
            default:
          }
        }
      }
    }
  }

  @HostListener("window:beforeunload", ["$event"])
  onBeforeUnload(event: BeforeUnloadEvent) {
    const { value } = this.projectManager.status;
    if (value !== null && value !== "saved") {
      event.preventDefault();
      event.returnValue = "";
    }
  }
}
