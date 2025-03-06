import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { assign, sample } from "lodash";
import { customAlphabet } from "nanoid";
import { Subscription } from "rxjs";
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { EditPipelineInputComponent } from "src/app/edit-pipeline-input/edit-pipeline-input.component";
import { matchIO } from "src/app/edit-pipeline-visual/utils";
import { SHORT_ID } from "src/consts/core";
import { UI } from "src/consts/ui";
import { Arrange } from "src/models/arrange";
import { InputFlow } from "src/models/input-flow";
import { LaunchRequest } from "src/models/launch-request";
import { Node, NodeInput, NodeOutput } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { OutputFlow } from "src/models/output-flow";
import { Pipeline, PipelineInput, PipelineOutput } from "src/models/pipeline";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { ProjectManager } from "src/services/project.manager";
import { Point } from "src/types/point";
import { Primitive } from "src/types/primitive";
import { AddNodeComponent } from "../add-node/add-node.component";

function tieUp({ x, y }: Point): Point {
  return { x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 };
}

@Component({
  selector: "app-edit-pipeline-visual",
  templateUrl: "./edit-pipeline-visual.component.html",
  styleUrls: ["./edit-pipeline-visual.component.scss"],
})
export class EditPipelineVisualComponent implements OnDestroy {
  userRole = UserRole;
  ui = UI;
  editNodeComponent = EditNodeComponent;
  editPipelineInputComponent = EditPipelineInputComponent;

  private _modal!:
    | EditNodeComponent
    | EditPipelineInputComponent
    | AddNodeComponent;

  mode: "default" | "flow" = "default";
  subscriptions: Subscription[] = [];

  set modal(
    modal: EditNodeComponent | EditPipelineInputComponent | AddNodeComponent
  ) {
    this._modal = modal;
    this.unsubscribe();
    if (!!modal) {
      if (modal instanceof EditNodeComponent) {
      } else if (modal instanceof AddNodeComponent) {
        this.subscriptions.push(
          modal.selected.subscribe((node) => {
            this.addNode(node);
            this.cd.detectChanges();

            this.router.navigate(["./"], { relativeTo: this.route });
          })
        );
      } else if (modal instanceof EditPipelineInputComponent) {
        this.subscriptions.push(
          modal.saved.subscribe((launchRequest) => {
            this.launchRequest = launchRequest;
            this.cd.detectChanges();
          })
        );
      }
    }
  }

  get modal() {
    return this._modal;
  }

  project!: Project;
  pipeline!: Pipeline;
  launchRequest!: LaunchRequest;

  flow: { from: string; output: string } | null = null;
  mouse: { x: number; y: number } | null = null;

  @ViewChild("nodesRef")
  nodesRef!: ElementRef<HTMLDivElement>;

  constructor(
    private projectManager: ProjectManager,
    private route: ActivatedRoute,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      [this.project, this.pipeline, this.launchRequest] = [
        project,
        project.pipeline,
        project.launchRequest,
      ];
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
    assign(node.arrange, tieUp({ x, y }));
    this.save();
  }

  inputMoving(input: PipelineInput, { x, y }: Point) {
    assign(input.arrange, { x, y });
    this.cd.detectChanges();
  }

  inputMoved(input: PipelineInput, { x, y }: Point) {
    assign(input.arrange, tieUp({ x, y }));
    this.save();
  }

  outputMoving(output: NodeOutput, { x, y }: Point) {
    assign(output.arrange, { x, y });
    this.cd.detectChanges();
  }

  outputMoved(output: NodeOutput, { x, y }: Point) {
    assign(output.arrange, tieUp({ x, y }));
    this.save();
  }

  private save() {
    const [pipeline, launchRequest] = [this.pipeline, this.launchRequest];
    this.projectManager.update({ pipeline, launchRequest });
  }

  editNode(node: string) {
    this.router.navigate(["nodes", node], { relativeTo: this.route });
  }

  editPipelineInput(input: string) {
    this.router.navigate(["inputs", input], { relativeTo: this.route });
  }

  addNode(node: Node) {
    const id = `${node._id}_${SHORT_ID()}`;
    delete node.catalog;
    this.pipeline.nodes.set(id, node);
    this.save();
  }

  addInput(id: string, input: PipelineInput) {
    if (!this.pipeline.inputs) {
      this.pipeline.inputs = new Map<string, PipelineInput>();
    }

    const exists = !!this.pipeline.inputs.get(id);
    const key = !exists ? id : `${id}_${SHORT_ID()}`;

    this.pipeline.inputs.set(key, input);
    const value = input.default;
    if (!!value) {
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
    const key = !exists ? id : `${id}_${SHORT_ID()}`;
    debugger;
    this.pipeline.outputs.set(key, output);
    this.save();
    this.cd.detectChanges();
  }

  startFlow(from: string, output: string) {
    this.flow = { from, output };
    this.mode = "flow";
  }

  @HostListener("document:mousemove", ["$event"])
  move(event: MouseEvent) {
    if (this.mode === "flow") {
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
    if (this.mode === "flow") {
      this.mode = "default";
      [this.flow, this.mouse] = [null, null];
    }
  }

  addFlow(to: string, input: string) {
    const { from, output } = this.flow;

    {
      const o = this.pipeline.nodes.get(from).outputs.get(output);
      const i = this.pipeline.nodes.get(to).inputs.get(input);
      if (!matchIO(o, i)) {
        return;
      }
    }

    const id = customAlphabet("1234567890abcdef", 5)();
    const key = `${from}_to_${to}_${id}`;
    this.pipeline.flows.set(
      key,
      new NodeFlow({
        from,
        output,
        to,
        input,
        color: sample([
          "red",
          "green",
          "blue",
          "yellow",
          "black",
          "white",
          "cyan",
          "magenta",
          "lime",
          "orange",
          "purple",
          "teal",
          "indigo",
          "pink",
          "brown",
        ]),
      })
    );
    this.mode = "default";
    this.save();
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

  removeCurrentNode() {
    if (this.modal instanceof EditNodeComponent) {
      const {
        node: { id: node },
      } = this.route.snapshot.firstChild.data;
      const { pipeline } = this;

      const flows = [];
      for (const [key, flow] of pipeline.flows) {
        if (flow.from === node || flow.to === node) {
          flows.push(key);
        }
      }
      for (const flow of flows) {
        pipeline.flows.delete(flow);
      }
      pipeline.nodes.delete(node);

      const index = pipeline.start.nodes.indexOf(node);
      if (index !== -1) {
        pipeline.start.nodes.splice(index, 1);
      }

      this.launchRequest.nodes.delete(node);
      this.save();

      this.router.navigate(["./"], { relativeTo: this.route });
    }
  }

  removeCurrentPipelineInput() {
    if (this.modal instanceof EditPipelineInputComponent) {
      const input = this.modal.id;
      const { pipeline, launchRequest } = this;

      pipeline.inputs.delete(input);
      launchRequest.inputs?.delete(input);
      this.save();

      this.router.navigate(["./"], { relativeTo: this.route });
    }
  }

  validate() {
    // TODO: waiting to be implemented
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
      extensions,
    } = input.input;

    this.pipeline.inputs ??= new Map<string, PipelineInput>();
    const flows = new Map<string, InputFlow>();
    flows.set(
      `to_${node.id}`,
      new InputFlow({
        to: node.id,
        input: input.id,
      })
    );

    const { x, y } = node.node.arrange;

    this.pipeline.inputs.set(
      input.id,
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
        extensions,
        flows,
        arrange: new Arrange({
          x: x - 100,
          y: y,
        }),
      })
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
      })
    );

    const { x, y } = node.node.arrange;

    this.pipeline.outputs.set(
      output.id,
      new PipelineOutput({
        title,
        type,
        flows,
        arrange: new Arrange({
          x: x + UI.node.width + 100,
          y: y + 10,
        }),
      })
    );
    this.cd.detectChanges();
    this.save();
  }
}
