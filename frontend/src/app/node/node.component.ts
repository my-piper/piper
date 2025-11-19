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
import { catchError, filter, map, of, Subscription } from "rxjs";
import { UI } from "src/consts/ui";
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
  node!: Node;

  @HostBinding("style.min-height.px")
  @Input()
  get height() {
    return (
      Math.max(this.node.inputs.size, this.node.outputs.size) *
        UI.node.input.height +
      30
    );
  }

  @Input()
  set launch(launch: Launch) {
    console.log("Set launch", launch?._id);
    if (!!launch) {
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
  project!: Project;

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

  @HostBinding("class.running")
  get running() {
    return this.status?.state === "running";
  }

  @Output()
  input = new EventEmitter<string>();

  @Output()
  output = new EventEmitter<string>();

  @Output()
  done = new EventEmitter<NodeOutputs>();

  subscriptions: { launch: () => void; sockets: Subscription[] } = {
    launch: null,
    sockets: [],
  };

  timers: { status: ReturnType<typeof setTimeout> | null } = { status: null };

  constructor(
    private socket: Socket,
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private live: LiveService
  ) {}

  ngOnDestroy(): void {
    this.silent();
  }

  private listen() {
    this.silent();

    console.log("Listen node events", this.id);

    this.subscriptions.launch = this.live.subscribe(this.launch._id);
    this.subscriptions.sockets.push(
      this.socket.fromEvent<Object>("node_running").subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          console.log("Node is running", node);
          this.checkStatus();
        }
      })
    );

    this.subscriptions.sockets.push(
      this.socket.fromEvent<Object>("node_done").subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          console.log("Node done", node);
          this.checkStatus();
        }
      })
    );

    this.subscriptions.sockets.push(
      this.socket.fromEvent<Object>("node_progress").subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          console.log("Progress for", node);
          this.loadProgress();
        }
      })
    );

    this.subscriptions.sockets.push(
      this.socket.fromEvent<Object>("node_not_ready").subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          console.log("Node is ready", node);
          this.checkStatus();
        }
      })
    );

    this.subscriptions.sockets.push(
      this.socket.fromEvent<Object>("node_error").subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          console.log("Node error", node);
          this.checkStatus();
        }
      })
    );

    this.subscriptions.sockets.push(
      this.socket.fromEvent<Object>("node_flow").subscribe((data: Object) => {
        const { launch, node } = plainToInstance(PipelineEvent, data as Object);
        if (launch === this.launch?._id && node === this.id) {
          console.log("Node is going to flow", node);
          this.load();
        }
      })
    );

    this.subscriptions.sockets.push(
      this.socket.fromEvent<Object>("node_reset").subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
          console.log("Node is reset", node);
          this.loadInputs();
        }
      })
    );

    this.checkStatus();
  }

  silent() {
    console.log("Node is silent", this.id);

    this.subscriptions.launch?.();
    this.subscriptions.sockets.forEach((s) => s.unsubscribe());
    this.subscriptions.sockets = [];

    clearTimeout(this.timers.status);
  }

  reset() {
    [this.status, this.progress] = [null, null];
    this.cd.detectChanges();
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
      catchError((err) => of(null)),
      map((obj) => obj as NodeOutputs)
    );
  }

  private checkStatus() {
    clearTimeout(this.timers.status);

    const check = () => {
      console.log("Check status");
      this.loadStatus().subscribe((status) => {
        this.status = status;
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

              console.log("Node done", this.id, outputs);
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
      map((json) => plainToInstance(NodeStatus, json))
    );
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
