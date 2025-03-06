import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { PipelineEvent } from "src/models/events";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { HttpService } from "src/services/http.service";

@Component({
  selector: "app-node-state",
  templateUrl: "./node-state.component.html",
  styleUrls: ["./node-state.component.scss"],
})
export class NodeStateComponent implements OnInit {
  launch: Launch;
  id!: string;
  node!: Node;

  state: Object;

  constructor(
    private socket: Socket,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ launch, node: { id, node } }) => {
      [this.launch, this.id, this.node] = [launch, id, node];
      this.loadState();
      this.listen();
    });
  }

  private listen() {
    this.socket.fromEvent<Object>("node_gonna_repeat").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      console.log("Load results for", launch, node);
      if (node === this.id) {
        this.loadState();
      }
    });
  }

  private loadState() {
    this.http
      .get(`launches/${this.launch._id}/nodes/${this.id}/state`)
      .subscribe((state) => {
        this.state = state;
        this.cd.detectChanges();
      });
  }
}
