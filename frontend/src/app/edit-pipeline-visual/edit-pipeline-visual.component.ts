import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  TemplateRef,
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
import { InputFlow } from "src/models/input-flow";
import { Launch } from "src/models/launch";
import { LaunchRequest, NodeToLaunch } from "src/models/launch-request";
import {
  Node,
  NodeInput,
  NodeOutput,
  NodeDeploy,
  SCRIPT_NODE_SOURCE,
} from "src/models/node";
import { DeployNode } from "src/models/deploy-node";
import { FlowTransformer, NodeFlow } from "src/models/node-flow";
import { OutputFlow } from "src/models/output-flow";
import {
  Layout,
  Pipeline,
  PipelineInput,
  PipelineOutput,
  LayoutGroup,
} from "src/models/pipeline";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { Ajv } from "src/providers/ajv";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { TopbarService } from "src/services/topbar.service";
import { NodeOutputs } from "src/types/node";
import { Point } from "src/types/point";
import { Primitive } from "src/types/primitive";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { getLabel } from "src/utils/i18n";
import { formatElapsed } from "src/utils/elapsed";
import { LaunchState, NodeRunState, launchState } from "src/utils/launch-state";
import {
  deployProblems,
  deploySocketsPath,
  isDeployNode,
  nodeFromDeploy,
  refreshFromDeploy,
} from "src/utils/deploy-node";
import { acceptedInputTypes } from "src/utils/flow-types";
import {
  frameAround,
  GROUP_COLORS,
  GROUP_MIN,
  GroupColor,
  groupMembers,
} from "src/utils/groups";
import { inputOffset } from "src/utils/node-layout";
import {
  CanvasClip,
  clipFromText,
  clipToText,
  copyNodes,
  pasteClip,
} from "src/utils/canvas-clipboard";
import { sid } from "src/utils/string";
import { mapTo, toInstance, toPlain } from "src/utils/models";
import * as YAML from "yaml";
import { AssistantComponent } from "../assistant/assistant.component";
import { EditNodeInputsComponent } from "../edit-node-inputs/edit-node-inputs.component";
import { LaunchLogsComponent } from "../launch-logs/launch-logs.component";
import { SelectNodeComponent } from "../select-node/select-node.component";

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
  isDeployNode = isDeployNode;

  /**
   * How each deploy node no longer matches its Deploy, by node key; checked
   * when the pipeline opens. Empty for a node that matches.
   */
  deployProblems: Record<string, string[]> = {};
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
  /** On the launch page: Stop succeeded, so the button stays hidden. */
  interrupted = false;

  /** Run states the canvas nodes report, keyed by node id. */
  nodeStates: Record<string, NodeRunState> = {};
  /** Time since the launch started, while the canvas sees it run. */
  elapsed: string | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
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

  /**
   * The open node search: where its node goes on the canvas (`x`, `y`), where
   * the popover sits in the viewport, and the wire to connect, if any.
   */
  search: {
    x: number;
    y: number;
    left: number;
    top: number;
    flow: EditPipelineVisualComponent["flow"];
    accepts: string[] | null;
    added: number;
  } | null = null;

  @ViewChild("drawlerRight", { static: true })
  drawlerRight!: RouterOutlet;

  /** Run state and the Launch action, shown in the app top bar. */
  @ViewChild("topbarActions", { static: true })
  topbarActions!: TemplateRef<unknown>;
  private readonly topbar = inject(TopbarService);

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
    private cd: ChangeDetectorRef,
    private location: Location,
  ) {}

  ngOnInit() {
    this.topbar.setActions(this.topbarActions);
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
      this.interrupted = false;
      if (this.mode === "project") {
        this.checkDeployNodes();
      }

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
  }

  back() {
    this.router.navigate([{ outlets: { primary: [] } }], {
      relativeTo: this.route,
    });
  }

  /** The launch as its nodes report it, for the top bar pill. */
  get launchState(): LaunchState | null {
    const inclusive = this.launch?.launchRequest?.inclusive?.nodes ?? [];
    return launchState(
      {
        nodes: [...this.pipeline.nodes.keys()],
        flows: [...(this.pipeline.flows?.values() ?? [])],
        start:
          inclusive.length > 0 ? inclusive : (this.pipeline.start?.nodes ?? []),
      },
      this.nodeStates,
    );
  }

  /**
   * Stop is offered while the canvas sees the launch run, the same state the
   * pill shows: on a reload of a finished launch no event clears it otherwise.
   */
  get stoppable(): boolean {
    return (
      this.mode === "launch" &&
      !this.interrupted &&
      this.launchState === "running"
    );
  }

  setNodeState(id: string, state: NodeRunState | null) {
    if (state) {
      this.nodeStates[id] = state;
    } else {
      delete this.nodeStates[id];
    }
    if (this.mode === "launch") {
      this.syncClock();
    }
    this.cd.detectChanges();
  }

  /** Ticks while a node runs; stopping freezes the last value. */
  private syncClock() {
    const running = this.launchState === "running";
    if (running && !this.clock) {
      this.tick();
      this.clock = setInterval(() => {
        this.tick();
        this.cd.detectChanges();
      }, 1000);
    } else if (!running && this.clock) {
      clearInterval(this.clock);
      this.clock = null;
      this.tick();
    }
  }

  private tick() {
    const from = this.launch?.startedAt ?? this.launch?.launchedAt;
    this.elapsed = from
      ? formatElapsed(Date.now() - new Date(from).getTime())
      : null;
  }

  showNodeLog(id: string) {
    const launch = this.launches[id] || this.launch;
    if (!launch) {
      return;
    }
    const right =
      this.mode === "project"
        ? ["launches", launch._id, "nodes", id, "logs"]
        : ["nodes", id, "logs"];
    this.router.navigate([{ outlets: { right, left: null } }], {
      relativeTo: this.route,
    });
  }

  ngOnDestroy() {
    this.topbar.clearActions(this.topbarActions);
    clearInterval(this.clock);
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
      case "group":
        if (editing) {
          event.preventDefault();
          this.groupSelection();
        }
        break;
      case "duplicate":
        if (editing) {
          event.preventDefault();
          const clip = this.selectedClip();
          if (clip) {
            this.paste(clip, null);
          }
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

  /** Last pointer position over the page, for pasting at it. */
  private pointer: { clientX: number; clientY: number } | null = null;

  private selectedClip() {
    const ids = [...this.selection]
      .map(splitKey)
      .filter(([type]) => type === "node")
      .map(([, id]) => id);
    return copyNodes(this.pipeline, this.launchRequest, ids);
  }

  /**
   * Ctrl/⌘ + C on the canvas puts the selected nodes on the clipboard, unless
   * a field has focus or the page has selected text to copy.
   */
  @HostListener("document:copy", ["$event"])
  copySelection(event: ClipboardEvent) {
    const target = event.target as HTMLElement | null;
    const onCanvas =
      target === this.document.body ||
      (!!target && this.host.nativeElement.contains(target));
    const text = this.document.getSelection()?.toString();
    if (this.mode !== "project" || !onCanvas || isEditable(target) || text) {
      return;
    }
    const clip = this.selectedClip();
    if (clip && event.clipboardData) {
      event.clipboardData.setData("text/plain", clipToText(clip));
      event.preventDefault();
    }
  }

  /** The canvas point under the pointer, or null when it is off the canvas. */
  private pointerPoint() {
    if (!this.pointer) {
      return null;
    }
    const { clientX, clientY } = this.pointer;
    const view = this.nodesRef.nativeElement.getBoundingClientRect();
    if (
      clientX < view.left ||
      clientX > view.right ||
      clientY < view.top ||
      clientY > view.bottom
    ) {
      return null;
    }
    const zoom = this.pipeline.layout?.zoom || 1;
    const pane = this.paneRef.nativeElement.getBoundingClientRect();
    return {
      x: Math.round((clientX - pane.left) / zoom),
      y: Math.round((clientY - pane.top) / zoom),
    };
  }

  /**
   * Adds a copy of `clip` with its top-left node at `at`, or 40px off the
   * originals without a point, and selects the copies.
   */
  paste(clip: CanvasClip, at: Point | null) {
    const corner = clip.nodes
      .map(([, plain]) => (plain as { arrange?: Point }).arrange)
      .reduce(
        (min, a) => ({
          x: Math.min(min.x, a?.x ?? 0),
          y: Math.min(min.y, a?.y ?? 0),
        }),
        { x: Infinity, y: Infinity },
      );
    const ids = pasteClip(
      clip,
      this.pipeline,
      this.launchRequest,
      at ?? { x: corner.x + 40, y: corner.y + 40 },
      (node) => `${node._id}_${sid()}`,
      ({ from, to }) => `${from}_to_${to}_${salt()}`,
    );
    if (this.pipeline.start.nodes.length <= 0) {
      this.pipeline.start.nodes.push(ids[0]);
    }
    this.selection = new Set(ids.map((id) => `node:${id}`));
    this.save();
    this.cd.detectChanges();
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
          this.interrupted = true;
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

  addNode(
    left: number,
    top: number,
    payload: { node: string } | { deploy: NodeDeploy },
    added?: (id: string, node: Node) => void,
  ) {
    if ("node" in payload || "deploy" in payload) {
      this.closeDrawler();

      const node$ =
        "deploy" in payload
          ? this.loadDeploy(payload.deploy).pipe(map(nodeFromDeploy))
          : this.http
              .get(`nodes/${payload.node}`)
              .pipe(map((obj) => toInstance(obj as object, Node)));
      node$
        .pipe(
          delay(UI_DELAY),
          finalize(() => {
            this.cd.detectChanges();
          }),
        )
        .subscribe({
          next: (node) => {
            const id = `${node._id}_${sid()}`;
            this.pipeline.nodes.set(id, node);
            if (this.pipeline.start.nodes.length <= 0) {
              this.pipeline.start.nodes.push(id);
            }
            assign(node.arrange, { x: left, y: top });
            added?.(id, node);
            this.save();
          },
          error: (err) => (this.error = err),
        });
    }
  }

  private loadDeploy(ref: NodeDeploy) {
    return this.http
      .get(deploySocketsPath(ref))
      .pipe(map((obj) => toInstance(obj as object, DeployNode)));
  }

  private checkDeployNodes() {
    this.deployProblems = {};
    for (const [key, node] of this.pipeline.nodes) {
      if (!isDeployNode(node) || !node.deploy) {
        continue;
      }
      this.loadDeploy(node.deploy).subscribe({
        next: (deploy) => {
          this.deployProblems[key] = deployProblems(node, deploy);
          this.cd.detectChanges();
        },
        error: () => {
          this.deployProblems[key] = [
            $localize`:@@message.deploy_unavailable:the Deploy is not found`,
          ];
          this.cd.detectChanges();
        },
      });
    }
  }

  /**
   * Re-copies a deploy node's sockets from its Deploy and drops the wires and
   * values of the sockets the Deploy no longer has.
   */
  refreshDeployNode(key: string) {
    const node = this.pipeline.nodes.get(key);
    this.loadDeploy(node.deploy).subscribe({
      next: (deploy) => {
        refreshFromDeploy(node, deploy);
        node.version = (node.version | 0) + 1;
        this.dropDanglingFlows(key, node);
        this.deployProblems[key] = [];
        this.save();
        this.cd.detectChanges();
      },
      error: (err) => (this.error = err),
    });
  }

  private dropDanglingFlows(key: string, node: Node) {
    const { flows, inputs, outputs } = this.pipeline;
    const gone = (flow: {
      from?: string;
      to?: string;
      input?: string;
      output?: string;
    }) =>
      (flow.to === key && !node.inputs.has(flow.input)) ||
      (flow.from === key && !node.outputs.has(flow.output));
    for (const [id, flow] of flows) {
      if (gone(flow)) {
        flows.delete(id);
      }
    }
    for (const [, input] of inputs || []) {
      for (const [id, flow] of input.flows || []) {
        if (gone(flow)) {
          input.flows.delete(id);
        }
      }
    }
    for (const [, output] of outputs || []) {
      for (const [id, flow] of output.flows || []) {
        if (gone(flow)) {
          output.flows.delete(id);
        }
      }
    }
    const values = this.launchRequest.nodes?.get(key)?.inputs;
    for (const id of [...(values?.keys() ?? [])]) {
      if (!node.inputs.has(id)) {
        values.delete(id);
      }
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
    this.pointer = { clientX: event.clientX, clientY: event.clientY };
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

  @HostListener("document:mouseup", ["$event"])
  stopMove(event?: MouseEvent) {
    if (this.state === "flow") {
      // A wire dropped on empty canvas asks which node to add there.
      if (event && this.onEmptyCanvas(event)) {
        this.openNodeSearch(event, this.flow);
      }
      this.state = "default";
      [this.flow, this.mouse] = [null, null];
    }
  }

  /**
   * Whether the pointer is over empty canvas. The pan directive's pointer
   * capture retargets events to the scroller; then the document says what is
   * under the pointer.
   */
  private onEmptyCanvas({ target, clientX, clientY }: MouseEvent) {
    const element = (
      target === this.nodesRef.nativeElement
        ? this.document.elementFromPoint(clientX, clientY)
        : target
    ) as HTMLElement | null;
    return (
      !!element &&
      this.paneRef.nativeElement.contains(element) &&
      !element.closest(".node, .input, .output, .flow, .actions")
    );
  }

  openNodeSearch(
    event: MouseEvent,
    flow: EditPipelineVisualComponent["flow"] = null,
  ) {
    if (!flow && !this.onEmptyCanvas(event)) {
      return;
    }
    const zoom = this.pipeline.layout?.zoom || 1;
    const rect = this.paneRef.nativeElement.getBoundingClientRect();
    this.search = {
      x: Math.round((event.clientX - rect.left) / zoom),
      y: Math.round((event.clientY - rect.top) / zoom),
      left: Math.max(16, Math.min(event.clientX, innerWidth - 416)),
      top: Math.max(16, Math.min(event.clientY, innerHeight - 456)),
      flow: flow ? { ...flow } : null,
      accepts: flow ? this.flowAccepts(flow) : null,
      added: 0,
    };
    this.cd.detectChanges();
  }

  closeNodeSearch() {
    this.search = null;
    this.cd.detectChanges();
  }

  /** Input types the wire being drawn can connect to. */
  private flowAccepts({
    type,
    from,
    output,
  }: EditPipelineVisualComponent["flow"]) {
    const source =
      type === "node"
        ? this.pipeline.nodes.get(from)?.outputs.get(output)?.type
        : this.pipeline.inputs?.get(from)?.type;
    if (!source) {
      return null;
    }
    return type === "node" ? acceptedInputTypes(source) : [source];
  }

  /**
   * Adds the node picked in the search at the search point, connected to the
   * dropped wire. A node added with the search kept open steps aside.
   */
  addFromSearch(
    picked: { node: string } | { deploy: NodeDeploy },
    keepOpen: boolean,
  ) {
    const { x, y, flow, accepts, added } = this.search;
    const step = added * 24;
    this.addNode(x + step, y + step, picked, (id, created) => {
      if (flow && accepts) {
        const input = this.connectAdded(flow, id, created, accepts);
        // The connected socket sits on the drop point.
        created.arrange.y -= input
          ? inputOffset(created, input)
          : UI.node.input.height + UI.node.shift;
      }
    });
    if (keepOpen) {
      this.search.added++;
    } else {
      this.search = null;
    }
    this.cd.detectChanges();
  }

  private connectAdded(
    { type, from, output }: EditPipelineVisualComponent["flow"],
    id: string,
    node: Node,
    accepts: string[],
  ): string | null {
    const inputs = [...node.inputs.entries()].filter(([, i]) =>
      accepts.includes(i.type),
    );
    const [key] = inputs.find(([, i]) => i.featured) ?? inputs[0] ?? [];
    if (!key) {
      return null;
    }
    if (type === "node") {
      this.addNodeFlow(from, output, id, key);
    } else {
      this.addInputFlow(from, id, key);
    }
    return key;
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
          // A named primary action, then a ghost Cancel (docs/design.md, #298).
          appearance: ["primary-destructive", "flat-grayscale"],
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

    const { x, y, w } = node.node.arrange;

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
          x: x + (w || UI.node.width) + 100,
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

  /**
   * A node's width while its edge is dragged (#321); saved on release. The
   * default width is stored as no width, like old pipelines.
   */
  setNodeWidth(id: string, width: number, done: boolean) {
    const node = this.pipeline.nodes.get(id);
    if (!node || this.mode !== "project" || typeof width !== "number") {
      return;
    }
    node.arrange ??= new Arrange({ x: 0, y: 0 });
    node.arrange.w = width === UI.node.width ? undefined : width;
    if (done) {
      this.save();
    }
    this.cd.detectChanges();
  }

  /** The selected nodes' ids, for grouping. */
  get selectedNodes(): string[] {
    return [...this.selection]
      .map(splitKey)
      .filter(([type, id]) => type === "node" && this.pipeline.nodes.has(id))
      .map(([, id]) => id);
  }

  /**
   * Wraps the selected nodes in a new group (#330). Node heights vary
   * (widgets, previews), so each node's box is measured on the canvas.
   */
  groupSelection() {
    if (this.mode !== "project") {
      return;
    }
    const boxes = this.nodeBoxes(this.selectedNodes);
    const frame = frameAround(boxes);
    if (!frame) {
      return;
    }
    this.pipeline.layout ??= new Layout();
    this.pipeline.layout.groups ??= new Map();
    const id = `group_${sid(6)}`;
    this.pipeline.layout.groups.set(
      id,
      toInstance({ title: "Group", ...frame }, LayoutGroup),
    );
    this.save();
    // A new group is ready to be named.
    this.startRenameGroup(id);
  }

  /**
   * Drags a group's bar (moves the frame and the nodes it holds) or its
   * corner (resizes the frame; nodes then in it belong to it). One save on
   * release; px are divided by the canvas zoom.
   */
  dragGroup(event: PointerEvent, id: string, mode: "move" | "resize") {
    const group = this.pipeline.layout?.groups?.get(id);
    if (!group || this.mode !== "project" || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    const zoom = this.pipeline.layout?.zoom || 1;
    const pointer = { x: event.clientX, y: event.clientY };
    const frame = { x: group.x, y: group.y, w: group.w, h: group.h };
    const members =
      mode === "move"
        ? groupMembers(this.pipeline, group).map((node) => {
            const arrange = this.pipeline.nodes.get(node).arrange;
            return { arrange, x: arrange.x, y: arrange.y };
          })
        : [];
    let moved = false;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser doesn't track (synthetic): moves still arrive.
    }

    const move = (e: PointerEvent) => {
      const dx = Math.round((e.clientX - pointer.x) / zoom);
      const dy = Math.round((e.clientY - pointer.y) / zoom);
      moved ||= dx !== 0 || dy !== 0;
      if (mode === "move") {
        assign(group, { x: frame.x + dx, y: frame.y + dy });
        for (const m of members) {
          assign(m.arrange, { x: m.x + dx, y: m.y + dy });
        }
      } else {
        assign(group, {
          w: Math.max(GROUP_MIN.w, frame.w + dx),
          h: Math.max(GROUP_MIN.h, frame.h + dy),
        });
      }
      this.cd.detectChanges();
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      if (moved) {
        this.save();
      }
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  /** The group colours, in the palette's order (#331). */
  readonly groupColors = GROUP_COLORS;
  /** The group whose title is being edited. */
  renamingGroup: string | null = null;
  /** The open group dropdown: `color:<id>` or `menu:<id>`. */
  openGroupMenu: string | null = null;

  setGroupColor(id: string, color: GroupColor) {
    const group = this.pipeline.layout?.groups?.get(id);
    if (!group || this.mode !== "project") {
      return;
    }
    group.color = color === "gray" ? undefined : color;
    this.openGroupMenu = null;
    this.save();
    this.cd.detectChanges();
  }

  startRenameGroup(id: string) {
    this.openGroupMenu = null;
    this.renamingGroup = id;
    this.cd.detectChanges();
    const field = this.paneRef?.nativeElement.querySelector<HTMLInputElement>(
      `[data-group="${CSS.escape(id)}"] .group-title-field`,
    );
    field?.focus();
    field?.select();
  }

  /** A blank title keeps the old one. */
  renameGroup(id: string, title: string) {
    const group = this.pipeline.layout?.groups?.get(id);
    if (this.renamingGroup !== id) {
      return;
    }
    this.renamingGroup = null;
    if (group && title.trim() && title.trim() !== group.title) {
      group.title = title.trim();
      this.save();
    }
    this.cd.detectChanges();
  }

  /** Fits the frame to the nodes it holds now. */
  fitGroup(id: string) {
    const group = this.pipeline.layout?.groups?.get(id);
    this.openGroupMenu = null;
    const frame = group
      ? frameAround(this.nodeBoxes(groupMembers(this.pipeline, group)))
      : null;
    if (frame) {
      assign(group, frame);
      this.save();
    }
    this.cd.detectChanges();
  }

  /** Removes the frame and keeps its nodes. */
  ungroup(id: string) {
    this.openGroupMenu = null;
    if (this.pipeline.layout?.groups?.delete(id)) {
      this.save();
    }
    this.cd.detectChanges();
  }

  /** Removes the frame and the nodes it holds, after one confirmation. */
  confirmDeleteGroup(id: string) {
    this.openGroupMenu = null;
    const group = this.pipeline.layout?.groups?.get(id);
    if (!group) {
      return;
    }
    const nodes = groupMembers(this.pipeline, group);
    const title = escape(group.title);
    const count = nodes.length;
    this.confirmRemove(
      $localize`:@@message.confirm_delete_group:Delete group «${title}:title:» and its ${count}:count: nodes? Their connections are deleted too.`,
    ).subscribe(() => {
      for (const node of nodes) {
        this.removeNode(node);
      }
      this.pipeline.layout.groups.delete(id);
      this.save();
      this.cd.detectChanges();
    });
  }

  /** Nodes' boxes on the canvas, measured: heights vary with content. */
  private nodeBoxes(ids: string[]) {
    return ids.map((id) => {
      const { x, y } = this.pipeline.nodes.get(id).arrange;
      const card = this.paneRef.nativeElement.querySelector<HTMLElement>(
        `[data-pick="node:${CSS.escape(id)}"] app-node`,
      );
      return {
        x,
        y,
        w: card?.offsetWidth ?? UI.node.width,
        h: card?.offsetHeight ?? 0,
      };
    });
  }

  /** How many nodes a group's frame holds (#329). */
  groupNodeCount(group: LayoutGroup): number {
    return groupMembers(this.pipeline, group).length;
  }

  /** Collapses a node to its title bar, or expands it (#320). */
  setCollapsed(id: string, collapsed: boolean) {
    const node = this.pipeline.nodes.get(id);
    // The node offers the toggle only to people who can edit (canEdit).
    if (!node || this.mode !== "project") {
      return;
    }
    node.arrange ??= new Arrange({ x: 0, y: 0 });
    node.arrange.collapsed = collapsed || undefined;
    this.save();
    this.cd.detectChanges();
  }

  /**
   * A wire dropped on a collapsed node joins its first featured input that
   * takes the wire's type and has no wire yet, else the first that takes it.
   */
  dropOnCollapsed(id: string) {
    const node = this.pipeline.nodes.get(id);
    const accepts = this.flow ? this.flowAccepts(this.flow) : null;
    if (!node || !accepts) {
      return;
    }
    const wired = (key: string) =>
      [...(this.pipeline.flows?.values() ?? [])].some(
        (f) => f.to === id && f.input === key,
      ) ||
      [...(this.pipeline.inputs?.values() ?? [])].some((i) =>
        [...(i.flows?.values() ?? [])].some(
          (f) => f.to === id && f.input === key,
        ),
      );
    const fits = [...node.inputs.entries()].filter(
      ([, input]) => input.featured && accepts.includes(input.type),
    );
    const [key] = fits.find(([k]) => !wired(k)) ?? fits[0] ?? [];
    if (key) {
      this.addFlow(id, key);
    }
  }

  /**
   * A node's inline widget changed an input value. Writes it where the node
   * drawer does, as a new map so the canvas re-reads it; `null` drops it,
   * so the input falls back to its default.
   */
  setNodeInput(node: string, input: string, value: Primitive | null) {
    if (this.mode !== "project") {
      return;
    }
    this.launchRequest.nodes ??= new Map();
    let request = this.launchRequest.nodes.get(node);
    if (!request) {
      request = new NodeToLaunch();
      this.launchRequest.nodes.set(node, request);
    }
    const inputs = new Map(request.inputs ?? []);
    if (value === null) {
      inputs.delete(input);
    } else {
      inputs.set(input, value);
    }
    request.inputs = inputs;
    this.projectManager.markDirty(this);
    this.cd.detectChanges();
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
  async pasteFromClipboard(event: ClipboardEvent) {
    // Nodes copied on a canvas go at the pointer.
    const clip = clipFromText(event.clipboardData?.getData("text/plain"));
    if (clip) {
      if (this.mode === "project" && !isEditable(event.target)) {
        event.preventDefault();
        this.paste(clip, this.pointerPoint());
      }
      return;
    }

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
