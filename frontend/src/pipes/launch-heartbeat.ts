import { Pipe, PipeTransform } from "@angular/core";
import { map, takeUntil } from "rxjs";
import { BehaviorSubject } from "rxjs/internal/BehaviorSubject";
import { HeartbeatEvent } from "src/models/events";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { createLogger, LogLevel } from "src/utils/logger";
import { toInstance } from "src/utils/models";

const logger = createLogger("launch_heartbeat", LogLevel.info);

@Pipe({ name: "launchHeartbeat" })
export class LaunchHeartbeatPipe
  extends UntilDestroyed
  implements PipeTransform
{
  current: BehaviorSubject<Date | null>;

  timer: any | null = null;

  subscriptions: { launch: () => void } = {
    launch: null,
  };

  constructor(
    private live: LiveService,
    private http: HttpService
  ) {
    super();
  }

  transform(launch: string) {
    const load = () => {
      this.http
        .get(`launches/${launch}/heartbeat`, null, { responseType: "text" })
        .pipe(map((date) => (!!date ? new Date(date as string) : null)))
        .subscribe((date) => this.current.next(date));
    };

    if (!this.current) {
      logger.debug("Listen heartbeat", launch);
      this.current = new BehaviorSubject<Date>(null);

      load();

      this.subscriptions.launch = this.live.subscribe(launch);
      this.live.socket
        .fromEvent<Object>("launch_heartbeat")
        .pipe(
          takeUntil(this.destroyed$),
          map((json) => toInstance(json, HeartbeatEvent))
        )
        .subscribe(({ launch: _id, heartbeat }) => {
          if (launch === _id) {
            logger.debug("Update heartbeat", heartbeat);
            this.current.next(heartbeat);
          }
        });
    }

    return this.current;
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.current?.complete();
    this.subscriptions.launch?.();
  }
}
