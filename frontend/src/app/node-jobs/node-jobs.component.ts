import {
  ChangeDetectorRef,
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import {
  delay,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  switchMap,
  tap,
} from "rxjs";
import { Launch } from "src/models/launch";
import { Node } from "src/models/node";
import { NodeJob } from "src/models/node-job";
import { HttpService } from "src/services/http.service";
import { LaunchFeeds } from "src/services/launch-feeds";
import { UI_DELAY } from "src/consts/ui";

@Component({
  selector: "app-node-jobs",
  templateUrl: "./node-jobs.component.html",
  styleUrls: ["./node-jobs.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeJobsComponent {
  private readonly destroyRef = inject(DestroyRef);

  progress = { loading: false };
  error: Error;

  launch: Launch;
  id!: string;
  node!: Node;

  jobs: NodeJob[];

  private readonly feeds = inject(LaunchFeeds);
  private readonly http = inject(HttpService);
  private readonly route = inject(ActivatedRoute);
  private readonly cd = inject(ChangeDetectorRef);

  ngOnInit() {
    // Reloads when its node is about to repeat, from the launch's feed.
    this.route.data
      .pipe(
        tap(({ launch, node: { id, node } }) => {
          [this.launch, this.id, this.node] = [launch, id, node];
          this.load();
        }),
        map(({ launch }) => (launch as Launch)._id),
        distinctUntilChanged(),
        switchMap((launch) => this.feeds.events(launch, null, ["repeat"])),
        filter(({ node }) => node === this.id),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.load());
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
        map((arr) => (arr as object[]).map((e) => plainToInstance(NodeJob, e))),
      )
      .subscribe({
        next: (jobs) => (this.jobs = jobs),
        error: (err) => (this.error = err.error),
      });
  }
}
