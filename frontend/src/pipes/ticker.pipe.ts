import { Pipe, PipeTransform } from "@angular/core";
import { BehaviorSubject, Observable, skip, takeUntil } from "rxjs";
import { createLogger, LogLevel } from "src/utils/logger";
import { UntilDestroyed } from "src/utils/until-destroyed";

const logger = createLogger("ticker", LogLevel.debug);

@Pipe({
  name: "ticker",
  standalone: false,
})
export class TickerPipe<T> extends UntilDestroyed implements PipeTransform {
  private ticker: BehaviorSubject<T>;
  private timer: any | null = null;

  constructor() {
    super();
  }

  transform(value: BehaviorSubject<T>, interval: number = 1000): Observable<T> {
    if (!this.ticker) {
      logger.debug("Start ticker");
      this.ticker = new BehaviorSubject<T>(value.value);
      value.pipe(takeUntil(this.destroyed$), skip(1)).subscribe((v: T) => {
        this.ticker.next(v);
        logger.debug("Tick by value change");
      });
      const tick = () => {
        this.ticker.next(this.ticker.value);
        logger.debug("Tick by timer");
        this.timer = setTimeout(tick, interval);
      };
      tick();
    }

    return this.ticker;
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.ticker?.complete();
    clearTimeout(this.timer);
  }
}
