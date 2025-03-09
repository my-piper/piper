import { ChangeDetectorRef, Component, Input } from "@angular/core";
import { plainToInstance } from "class-transformer";
import { merge } from "lodash";
import last from "lodash/last";
import { delay, finalize, map, takeUntil } from "rxjs";
import { AppConfig } from "src/models/app-config";
import { SetLaunchErrorsEvent, SetLaunchOutputEvent } from "src/models/events";
import { Launch, LaunchesFilter } from "src/models/launch";
import { PipelineLaunchedSignal } from "src/models/signals/launch";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { SignalsService } from "src/services/signals.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { toPlain } from "src/utils/models";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";

@Component({
  selector: "app-launches",
  templateUrl: "./launches.component.html",
  styleUrls: ["./launches.component.scss"],
})
export class LaunchesComponent extends UntilDestroyed {
  private _filter!: LaunchesFilter;

  progress: { removing: { [key: string]: boolean }; loading: boolean } = {
    removing: {},
    loading: false,
  };
  error: Error;

  references: { popover: PopoverComponent } = { popover: null };

  @Input()
  set filter(filter: LaunchesFilter) {
    this._filter = filter;
    this.launches = [];
    this.load();
  }

  get filter() {
    return this._filter;
  }

  chunk: Launch[] = [];
  launches: Launch[] = [];

  subscriptions: { outputs: () => void; errors: () => void } = {
    outputs: null,
    errors: null,
  };

  constructor(
    public config: AppConfig,
    private http: HttpService,
    private live: LiveService,
    private signals: SignalsService,
    private cd: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit() {
    this.listen();

    this.signals.feed.subscribe((event) => {
      if (event instanceof PipelineLaunchedSignal) {
        const { launch } = event;
        this.launches.unshift(launch);
        this.cd.detectChanges();
      }
    });
  }

  private listen() {
    this.subscriptions.outputs = this.live.subscribe("launch_outputs");
    this.live.socket
      .fromEvent<Object>("set_output")
      .pipe(
        takeUntil(this.destroyed$),
        map((json) => plainToInstance(SetLaunchOutputEvent, json))
      )
      .subscribe(({ launch, id, output }) => {
        for (const l of this.launches) {
          if (l._id === launch) {
            const o = l.outputs.get(id);
            merge(o, output);
            this.cd.detectChanges();
          }
        }
      });
    this.subscriptions.errors = this.live.subscribe("launch_errors");
    this.live.socket
      .fromEvent<Object>("set_errors")
      .pipe(
        takeUntil(this.destroyed$),
        map((json) => plainToInstance(SetLaunchErrorsEvent, json))
      )
      .subscribe(({ launch, errors }) => {
        for (const l of this.launches) {
          if (l._id === launch) {
            l.errors = errors;
            this.cd.detectChanges();
          }
        }
      });
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.subscriptions.outputs?.();
    this.subscriptions.errors?.();
  }

  private load(cursor?: string) {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("launches", toPlain({ ...this.filter, cursor }))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as Object[]).map((e) => plainToInstance(Launch, e)))
      )
      .subscribe({
        next: (launches) => {
          this.chunk = launches;
          this.launches.push(...launches);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err.error),
      });
  }

  loadMore() {
    const launch = last(this.launches);
    if (!!launch) {
      this.load(launch.cursor);
    }
  }

  remove(launch: Launch) {
    this.progress.removing[launch._id] = true;
    this.cd.detectChanges();

    this.http
      .delete(`launches/${launch._id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.removing[launch._id] = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          const index = this.launches.indexOf(launch);
          if (index !== -1) {
            this.launches.splice(index, 1);
            this.cd.detectChanges();
          }
        },
        error: (err) => (this.error = err.error),
      });
  }
}
