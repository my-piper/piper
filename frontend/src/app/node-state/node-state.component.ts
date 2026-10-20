import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { takeUntil } from "rxjs";
import { PipelineEvent } from "src/models/events";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { HttpService } from "src/services/http.service";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";

@Component({
  selector: "app-node-state",
  templateUrl: "./node-state.component.html",
  styleUrls: ["./node-state.component.scss"],
})
export class NodeStateComponent extends UntilDestroyed implements OnInit {
  launch: Launch;
  id!: string;
  node!: Node;

  state: Object;

  constructor(
    private socket: Socket,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit() {
    this.listen();
    this.route.data.subscribe(({ launch, node: { id, node } }) => {
      [this.launch, this.id, this.node] = [launch, id, node];
      this.loadState();
    });
  }

  private listen() {
    this.socket
      .fromEvent<Object>("node_gonna_repeat")
      .pipe(takeUntil(this.destroyed$))
      .subscribe((data) => {
        const { launch, node } = plainToInstance(PipelineEvent, data);
        if (launch === this.launch?._id && node === this.id) {
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
