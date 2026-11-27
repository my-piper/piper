import {
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { plainToInstance } from "class-transformer";
import { assign, merge } from "lodash";
import last from "lodash/last";
import { delay, finalize, map } from "rxjs";
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
import { UI_DELAY } from "src/consts/ui";
import { mapTo, toPlain } from "src/utils/models";
import { USER_ROOM } from "src/consts/rooms";

@Component({
  selector: "app-launches",
  templateUrl: "./launches.component.html",
  styleUrls: ["./launches.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class LaunchesComponent implements OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  userRole = UserRole;

  private _filter!: LaunchesFilter;

  progress = {
    removing: {} as { [key: number]: boolean },
    loading: false,
  };
  error: Error;

  actionsOpen: string | null = null;

  /** Cards show each launch's outputs (playground); a table lists them. */
  @Input()
  view: "cards" | "table" = "cards";

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
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.listen();

    this.signals.feed
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof PipelineLaunchedSignal) {
          const { launch } = event;
          this.launches.unshift(launch);
          this.cd.detectChanges();
        }
      });
  }

  private listen() {
    this.subscriptions.user = this.live.subscribe(USER_ROOM(this.me.user._id));
    this.live.socket
      .fromEvent<object>("set_inputs")
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map((json) => plainToInstance(SetLaunchInputsEvent, json)),
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
      .fromEvent<object>("set_output")
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map((json) => plainToInstance(SetLaunchOutputEvent, json)),
      )
      .subscribe(({ launch, id, output }) => {
        for (const l of this.launches) {
          if (l._id === launch) {
            // Outputs unknown to the listed launch are added, not dropped.
            l.outputs ??= new Map();
            const o = l.outputs.get(id);
            l.outputs.set(id, o ? merge(o, output) : output);
            this.cd.detectChanges();
          }
        }
      });
    this.live.socket
      .fromEvent<object>("set_errors")
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map((json) => plainToInstance(SetLaunchErrorsEvent, json)),
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

  ngOnDestroy(): void {
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
        map((arr) => (arr as object[]).map((e) => plainToInstance(Launch, e))),
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
    if (launch) {
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
          this.actionsOpen = null;
          this.cd.detectChanges();
        }),
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
