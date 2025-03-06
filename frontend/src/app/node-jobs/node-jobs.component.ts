import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { delay, finalize, map } from "rxjs";
import { PipelineEvent } from "src/models/events";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { NodeJob } from "src/models/node-job";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";

@Component({
  selector: "app-node-jobs",
  templateUrl: "./node-jobs.component.html",
  styleUrls: ["./node-jobs.component.scss"],
})
export class NodeJobsComponent {
  progress = { loading: false };
  error: Error;

  launch: Launch;
  id!: string;
  node!: Node;

  jobs: NodeJob[];

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
    this.socket.fromEvent<Object>("node_gonna_repeat").subscribe((data) => {
      const { launch, node } = plainToInstance(PipelineEvent, data);
      console.log("Load results for", launch, node);
      if (node === this.id) {
        this.load();
      }
    });
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(`launches/${this.launch._id}/nodes/${this.id}/jobs`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as Object[]).map((e) => plainToInstance(NodeJob, e)))
      )
      .subscribe({
        next: (jobs) => (this.jobs = jobs),
        error: (err) => (this.error = err.error),
      });
  }
}
