import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  Renderer2,
  ViewChild,
} from "@angular/core";
import { ActivatedRoute, Router, RouterOutlet } from "@angular/router";
import { assign, isEmpty, mapValues, random } from "lodash";
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
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { EditPipelineInputComponent } from "src/app/edit-pipeline-input/edit-pipeline-input.component";
import { UI, UI_DELAY } from "src/consts/ui";
import { AppConfig } from "src/models/app-config";
import { Arrange } from "src/models/arrange";
import { InputFlow } from "src/models/input-flow";
import { Launch } from "src/models/launch";
import { LaunchRequest, NodeToLaunch } from "src/models/launch-request";
import { Node, NodeInput, NodeOutput } from "src/models/node";
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
import { ProjectManager } from "src/services/project.manager";
import { NodeOutputs } from "src/types/node";
import { Point } from "src/types/point";
import { Primitive } from "src/types/primitive";
import { sid } from "src/ui-kit/utils/string";
import { mapTo, toInstance, toPlain } from "src/utils/models";
import * as YAML from "yaml";
import { AssistantComponent } from "../assistant/assistant.component";
import { EditNodeInputsComponent } from "../edit-node-inputs/edit-node-inputs.component";
import { SelectNodeComponent } from "../select-node/select-node.component";

function salt() {
  return customAlphabet("1234567890abcdef", 5)();
}

@Component({
  selector: "app-edit-pipeline-visual",
  templateUrl: "./edit-pipeline-visual.component.html",
  styleUrls: ["./edit-pipeline-visual.component.scss"],
})
export class EditPipelineVisualComponent implements OnDestroy {
  userRole = UserRole;
  ui = UI;
  selectNodeComponent = SelectNodeComponent;
  editNodeComponent = EditNodeComponent;
  editPipelineInputComponent = EditPipelineInputComponent;
  editNodeInputsComponent = EditNodeInputsComponent;

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
  launches: {
    [key: string]: Launch;
  } = {};

  modal!:
    | EditNodeComponent
    | EditPipelineInputComponent
    | SelectNodeComponent
    | null;

  drawlers: {
    left: SelectNodeComponent | null;
    right: EditNodeComponent | null;
    bottom: AssistantComponent | null;
  } = { left: null, right: null, bottom: null };

  state: "default" | "flow" = "default";
  subscriptions: Subscription[] = [];

  mode: "project" | "launch" = "project";

  project!: Project;
  pipeline!: Pipeline;
  launchRequest!: LaunchRequest;
  currentNode!: Node;

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
  gridRef!: ElementRef<HTMLElement>;

  constructor(
    private projectManager: ProjectManager,
    public config: AppConfig,
    private route: ActivatedRoute,
    private http: HttpService,
    private ajv: Ajv,
    private router: Router,
    private renderer: Renderer2,
    private cd: ChangeDetectorRef,
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

  nodeMoving(node: Node, { x, y }: Point) {
    assign(node.arrange, { x, y });
    this.cd.detectChanges();
  }

  nodeMoved(node: Node, { x, y }: Point) {
    assign(node.arrange, { x, y });
    this.save();
  }

  inputMoving(input: PipelineInput, { x, y }: Point) {
    assign(input.arrange, { x, y });
    this.cd.detectChanges();
  }

  inputMoved(input: PipelineInput, { x, y }: Point) {
    assign(input.arrange, { x, y });
    this.save();
  }

  outputMoving(output: NodeOutput, { x, y }: Point) {
    assign(output.arrange, { x, y });
    this.cd.detectChanges();
  }

  outputMoved(output: NodeOutput, { x, y }: Point) {
    assign(output.arrange, { x, y });
    this.save();
  }

  private save() {
    this.projectManager.markDirty();
  }

  run() {
    this.progress.launching = true;
    this.cd.detectChanges();

    const request = toInstance(
      {
        options: {
          bucket: "output",
        },
      },
      LaunchRequest,
    );

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
          this.progress.launching = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, Launch)),
      )
      .subscribe({
        next: (launch) => {
          this.launch = launch;
          this.cd.detectChanges();

          this.saveUrlState();
        },
        error: (err) => (this.error = err),
      });
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
          this.launch = null;
          this.cd.detectChanges();

          this.saveUrlState();
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
          bucket: "output",
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
    if (this.launch) {
      assign(params, { launch: this.launch._id });
    }
    if (!isEmpty(this.launches)) {
      const launches = mapValues(this.launches, (l) => l._id);
      const qs = stringify(launches, { delimiter: "," }).replace(/\=/g, ":");
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

  editPipelineInput(input: string) {
    this.router.navigate(["inputs", input], { relativeTo: this.route });
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
    if (value) {
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
        if (i.type !== i.type) {
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
    this.cd.detectChanges();
    this.save();
  }

  removeInput(input: string) {
    this.pipeline.inputs.delete(input);

    this.cd.detectChanges();
    this.save();
  }

  removeNode(node: string) {
    this.pipeline.nodes.delete(node);
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

  @HostListener("click", ["$event"])
  selectNode(event: MouseEvent, id: string, node: Node) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select")) {
      return;
    }

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

  @HostListener("click", ["$event"])
  clickOnGrid(event: MouseEvent) {
    const { nativeElement: gridElement } = this.gridRef;
    if (event.target === gridElement) {
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
            case "text/plain":
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
