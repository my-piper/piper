import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { delay, finalize, map, merge } from "rxjs";
import { PipelineEvent } from "src/models/events";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { NodeLog } from "src/models/node-log";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";

@Component({
  selector: "app-node-logs",
  templateUrl: "./node-logs.component.html",
  styleUrls: ["./node-logs.component.scss"],
})
export class NodeLogsComponent {
  progress = { loading: false };
  error: Error;

  launch: Launch;
  id!: string;
  node!: Node;

  logs: NodeLog[];

  constructor(
    private socket: Socket,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ launch, node: { id, node } }) => {
      [this.launch, this.id, this.node] = [launch, id, node];
      this.load();
      this.listen();
    });
  }

  private listen() {
    merge(
      this.socket.fromEvent("node_gonna_repeat"),
      this.socket.fromEvent("node_error"),
      this.socket.fromEvent("node_done")
    ).subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      console.log("Load logs for", launch, node);
      if (node === this.id) this.load();
    });
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(`launches/${this.launch._id}/nodes/${this.id}/logs`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as Object[]).map((e) => plainToInstance(NodeLog, e)))
      )
      .subscribe({
        next: (logs) => (this.logs = logs),
        error: (err) => (this.error = err.error),
      });
  }
}
