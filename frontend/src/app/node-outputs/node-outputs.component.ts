import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { map, takeUntil } from "rxjs";
import { PipelineEvent } from "src/models/events";
import { Launch } from "src/models/launch";
import { Node, NodeStatus } from "src/models/node";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { NodeInputs, NodeOutputs } from "src/types/node";
import { UntilDestroyed } from "src/utils/until-destroyed";

@Component({
  selector: "app-node-outputs",
  templateUrl: "./node-outputs.component.html",
  styleUrls: ["./node-outputs.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeOutputsComponent extends UntilDestroyed implements OnInit {
  launch: Launch;
  id!: string;
  node!: Node;

  subscriptions: { launch: () => void } = { launch: null };

  inputs!: NodeInputs;
  outputs!: NodeOutputs;
  status!: NodeStatus;

  constructor(
    private live: LiveService,
    private socket: Socket,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {
    super();
  }

  ngOnInit() {
    this.listen();
    this.route.data.subscribe(({ launch, node: { id, node } }) => {
      [this.launch, this.id, this.node] = [launch, id, node];
      this.joinRoom();
      this.loadInputs();
      this.loadOutputs();
      this.loadStatus();
    });
  }

  private joinRoom() {
    // Join the new room before leaving the old one: no gap for one launch.
    const previous = this.subscriptions.launch;
    this.subscriptions.launch = this.live.subscribe(this.launch._id);
    previous?.();
  }

  private isMine(data: object) {
    const { launch, node } = plainToInstance(PipelineEvent, data);
    return launch === this.launch?._id && node === this.id;
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.subscriptions.launch?.();
  }

  private listen() {
    this.socket
      .fromEvent<object>("node_running")
      .pipe(takeUntil(this.destroyed$))
      .subscribe((data: object) => {
        if (this.isMine(data)) {
          this.loadStatus();
        }
      });

    this.socket
      .fromEvent<object>("node_done")
      .pipe(takeUntil(this.destroyed$))
      .subscribe((data) => {
        if (this.isMine(data)) {
          this.loadStatus();
          this.loadOutputs();
        }
      });

    this.socket
      .fromEvent<object>("node_not_ready")
      .pipe(takeUntil(this.destroyed$))
      .subscribe((data) => {
        if (this.isMine(data)) {
          this.loadStatus();
          this.loadOutputs();
        }
      });

    this.socket
      .fromEvent<object>("node_flow")
      .pipe(takeUntil(this.destroyed$))
      .subscribe((data) => {
        if (this.isMine(data)) {
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
