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
import { distinctUntilChanged, filter, map, switchMap, tap } from "rxjs";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { HttpService } from "src/services/http.service";
import { LaunchFeeds } from "src/services/launch-feeds";

@Component({
  selector: "app-node-state",
  templateUrl: "./node-state.component.html",
  styleUrls: ["./node-state.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeStateComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly feeds = inject(LaunchFeeds);
  private readonly http = inject(HttpService);
  private readonly route = inject(ActivatedRoute);
  private readonly cd = inject(ChangeDetectorRef);

  launch: Launch;
  id!: string;
  node!: Node;

  state: object;

  ngOnInit() {
    // Reloads when its node is about to repeat, from the launch's feed.
    this.route.data
      .pipe(
        tap(({ launch, node: { id, node } }) => {
          [this.launch, this.id, this.node] = [launch, id, node];
          this.loadState();
        }),
        map(({ launch }) => (launch as Launch)._id),
        distinctUntilChanged(),
        switchMap((launch) => this.feeds.events(launch, null, ["repeat"])),
        filter(({ node }) => node === this.id),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadState());
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
