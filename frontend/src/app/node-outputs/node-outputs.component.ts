import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { Launch } from "src/models/launch";
import { Node, NodeStatus } from "src/models/node";
import { LaunchFeeds, NodeFeed } from "src/services/launch-feeds";
import { NodeOutputs } from "src/types/node";

/** The outputs of the node the drawer opens, live from the Launch feed. */
@Component({
  selector: "app-node-outputs",
  templateUrl: "./node-outputs.component.html",
  styleUrls: ["./node-outputs.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeOutputsComponent implements OnInit {
  private readonly feeds = inject(LaunchFeeds);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  launch: Launch;
  id!: string;
  node!: Node;

  private feed: NodeFeed | null = null;

  get outputs(): NodeOutputs | null | undefined {
    return this.feed?.outputs();
  }

  get status(): NodeStatus | null {
    return this.feed?.status() ?? null;
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.feed?.release());
  }

  ngOnInit() {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ launch, node: { id, node } }) => {
        [this.launch, this.id, this.node] = [launch, id, node];
        // Watch the new node before releasing the old one: the launch's room
        // stays joined while the drawer switches nodes.
        const previous = this.feed;
        this.feed = this.feeds.watch(launch._id, id);
        previous?.release();
      });
  }

  copy(text: string) {
    navigator.clipboard.writeText(text);
  }
}
