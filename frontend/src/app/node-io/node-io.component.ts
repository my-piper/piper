import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { map } from "rxjs";
import { PipelineEvent } from "src/models/events";
import { Launch } from "src/models/launch";
import { Node, NodeStatus } from "src/models/node";
import { HttpService } from "src/services/http.service";
import { NodeInputs, NodeOutputs } from "src/types/node";

@Component({
  selector: "app-node-io",
  templateUrl: "./node-io.component.html",
  styleUrls: ["./node-io.component.scss"],
})
export class NodeIOComponent implements OnInit {
  launch: Launch;
  id!: string;
  node!: Node;

  inputs!: NodeInputs;
  outputs!: NodeOutputs;
  status!: NodeStatus;

  constructor(
    private socket: Socket,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, launch, node: { id, node } }) => {
      [this.launch, this.id, this.node] = [launch, id, node];
      this.loadInputs();
      this.loadOutputs();
      this.loadStatus();
      this.listen();
    });
  }

  private listen() {
    this.socket.fromEvent<Object>("node_running").subscribe((data: Object) => {
      const { node } = plainToInstance(PipelineEvent, data);
      if (node === this.id) {
        console.log("Node is running", node);
        this.loadStatus();
      }
    });

    this.socket.fromEvent<Object>("node_done").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      console.log("Load results for", launch, node);
      if (node === this.id) {
        this.loadStatus();
        this.loadOutputs();
      }
    });

    this.socket.fromEvent<Object>("node_not_ready").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      console.log("Load results for", launch, node);
      if (node === this.id) {
        this.loadStatus();
        this.loadOutputs();
      }
    });

    this.socket.fromEvent<Object>("node_flow").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      console.log("Load results for", launch, node);
      if (node === this.id) {
        this.loadInputs();
      }
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
    this.http
      .get(`launches/${this.launch._id}/${this.id}/outputs`)
      .subscribe((outputs) => {
        this.outputs = outputs as NodeOutputs;
        this.cd.detectChanges();
      });
  }

  private loadStatus() {
    this.http
      .get(`launches/${this.launch._id}/${this.id}/status`)
      .pipe(map((json) => plainToInstance(NodeStatus, json)))
      .subscribe((status) => {
        this.status = status;
        this.cd.detectChanges();
      });
  }

  copy(text: string) {
    navigator.clipboard.writeText(text);
  }
}
