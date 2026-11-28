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
import { Node } from "src/models/node";
import { LaunchFeeds, NodeFeed } from "src/services/launch-feeds";
import { NodeInputs } from "src/types/node";

/** The inputs of the node the drawer opens, live from the Launch feed. */
@Component({
  selector: "app-node-inputs",
  templateUrl: "./node-inputs.component.html",
  styleUrls: ["./node-inputs.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeInputsComponent implements OnInit {
  private readonly feeds = inject(LaunchFeeds);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  launch: Launch;
  id!: string;
  node!: Node;

  private feed: NodeFeed | null = null;

  get inputs(): NodeInputs | undefined {
    return this.feed?.inputs();
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
