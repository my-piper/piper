import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  Output,
} from "@angular/core";
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
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { NodeInputs, NodeOutputs } from "src/types/node";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";

@Component({
  selector: "app-node",
  templateUrl: "./node.component.html",
  styleUrls: ["./node.component.scss"],
})
export class NodeComponent implements OnDestroy {
  private _launch!: Launch;

  references: { popover?: PopoverComponent } = { popover: null };

  @Input()
  id!: string;

  @HostBinding("class.start")
  @Input()
  start!: boolean;

  @HostBinding("class.done")
  @Input()
  get done() {
    return this.status?.state === "done";
  }

  @HostBinding("class.error")
  @Input()
  get error() {
    return this.status?.state === "error";
  }

  @Input()
  node!: Node;

  @Input()
  set launch(launch: Launch) {
    this._launch = launch;
    this.load();
    this.listen();
  }

  get launch() {
    return this._launch;
  }

  @Input()
  inputs!: NodeInputs;

  outputs!: NodeOutputs;
  status!: NodeStatus;
  progress!: NodeProgress;

  @Output()
  moved = new EventEmitter<Node>();

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

  @HostBinding("class.running")
  get running() {
    return this.status?.state === "running";
  }

  @Output()
  input = new EventEmitter<string>();

  @Output()
  output = new EventEmitter<string>();

  subscriptions: { launch: () => void } = {
    launch: null,
  };

  constructor(
    private socket: Socket,
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private live: LiveService
  ) {}

  ngOnDestroy(): void {
    this.subscriptions.launch?.();
  }

  private listen() {
    this.subscriptions.launch = this.live.subscribe(this._launch._id);
    this.socket.on("reconnect", () => this.load());

    console.log("Listen node events", this.id);
    this.socket.fromEvent<Object>("node_running").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      if (node === this.id) {
        console.log("Node is running", node);
        this.loadStatus();
      }
    });

    this.socket.fromEvent<Object>("node_done").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      if (node === this.id) {
        console.log("Node done", node);
        this.loadStatus();
        this.loadOutputs();
      }
    });

    this.socket.fromEvent<Object>("node_progress").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      if (node === this.id) {
        console.log("Progress for", node);
        this.loadProgress();
      }
    });

    this.socket.fromEvent<Object>("node_not_ready").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      if (node === this.id) {
        console.log("Node is ready", node);
        this.loadStatus();
        this.loadOutputs();
      }
    });

    this.socket.fromEvent<Object>("node_error").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      if (node === this.id) {
        console.log("Node error", node);
        this.loadStatus();
      }
    });

    this.socket.fromEvent<Object>("node_flow").subscribe((data: Object) => {
      const { launch, node } = plainToInstance(PipelineEvent, data as Object);
      if (node === this.id) {
        console.log("Node is going to flow", node);
        this.load();
      }
    });

    this.socket.fromEvent<Object>("node_reset").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      if (node === this.id) {
        console.log("Node is reset", node);
        this.loadInputs();
      }
    });
  }

  pinFrom(output: string) {
    this.output.emit(output);
  }

  pinTo(input: string) {
    this.input.emit(input);
  }

  private load() {
    console.log("Load node state", this.id);
    this.loadInputs();
    this.loadOutputs();
    this.loadStatus();
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
    this.http
      .get(`launches/${this.launch._id}/${this.id}/outputs`)
      .pipe(catchError((err) => of(null)))
      .subscribe((outputs) => {
        this.outputs = outputs as NodeOutputs;
        this.cd.detectChanges();
      });
  }

  private loadStatus() {
    this.http
      .get(`launches/${this.launch._id}/${this.id}/status`)
      .pipe(
        filter((json) => !!json),
        map((json) => plainToInstance(NodeStatus, json))
      )
      .subscribe((status) => {
        this.status = status;
        this.cd.detectChanges();
      });
  }

  private loadProgress() {
    this.http
      .get(`launches/${this.launch._id}/${this.id}/progress`)
      .pipe(
        filter((json) => !!json),
        map((json) => plainToInstance(NodeProgress, json))
      )
      .subscribe((progress) => {
        this.progress = progress;
        this.cd.detectChanges();
      });
  }

  emitTakeOutInput(key: string, input: NodeInput) {
    this.references.popover?.hide();
    this.takeOutInput.emit({
      input: { id: key, input },
      node: { id: this.id, node: this.node },
    });
  }

  emitTakeOutOutput(key: string, output: NodeOutput) {
    this.references.popover?.hide();
    this.takeOutOutput.emit({
      output: {
        id: key,
        output,
      },
      node: { id: this.id, node: this.node },
    });
  }
}
