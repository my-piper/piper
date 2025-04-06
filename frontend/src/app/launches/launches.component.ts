import { ChangeDetectorRef, Component, Input, OnDestroy } from "@angular/core";
import { plainToInstance } from "class-transformer";
import { assign, merge } from "lodash";
import last from "lodash/last";
import { delay, finalize, map, takeUntil } from "rxjs";
import { AppConfig } from "src/models/app-config";
import {
  SetLaunchErrorsEvent,
  SetLaunchInputsEvent,
  SetLaunchOutputEvent,
} from "src/models/events";
import { Launch, LaunchesFilter } from "src/models/launch";
import { PipelineLaunchedSignal } from "src/models/signals/launch";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { MeManager } from "src/services/me.service";
import { SignalsService } from "src/services/signals.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { mapTo, toPlain } from "src/utils/models";

@Component({
  selector: "app-launches",
  templateUrl: "./launches.component.html",
  styleUrls: ["./launches.component.scss"],
})
export class LaunchesComponent extends UntilDestroyed implements OnDestroy {
  userRole = UserRole;

  private _filter!: LaunchesFilter;

  progress = {
    removing: {} as { [key: number]: boolean },
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

  subscriptions: { user: () => void } = {
    user: null,
  };

  constructor(
    public config: AppConfig,
    private http: HttpService,
    private live: LiveService,
    private me: MeManager,
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
    this.subscriptions.user = this.live.subscribe(this.me.user._id);
    this.live.socket
      .fromEvent<Object>("set_inputs")
      .pipe(
        takeUntil(this.destroyed$),
        map((json) => plainToInstance(SetLaunchInputsEvent, json))
      )
      .subscribe(({ launch, inputs }) => {
        for (const l of this.launches) {
          if (l._id === launch) {
            assign(l, { inputs });
            this.cd.detectChanges();
          }
        }
      });
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
    this.subscriptions.user?.();
  }

  private load(cursor?: string) {
    this.progress.loading = true;
    this.cd.detectChanges();

    const filter = mapTo({ ...this.filter, cursor }, LaunchesFilter);
    this.http
      .get("launches", toPlain(filter))
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

  remove(index: number, launch: Launch) {
    this.progress.removing[index] = true;
    this.cd.detectChanges();

    this.http
      .delete(`launches/${launch._id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.removing[index] = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.launches.splice(index, 1);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err.error),
      });
  }
}
