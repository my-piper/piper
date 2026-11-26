import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
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
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeStateComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  launch: Launch;
  id!: string;
  node!: Node;

  state: object;

  constructor(
    private socket: Socket,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.listen();
    this.route.data.subscribe(({ launch, node: { id, node } }) => {
      [this.launch, this.id, this.node] = [launch, id, node];
      this.loadState();
    });
  }

  private listen() {
    this.socket
      .fromEvent<object>("node_gonna_repeat")
      .pipe(takeUntilDestroyed(this.destroyRef))
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
        this.state = state as object;
        this.cd.detectChanges();
      });
  }
}
