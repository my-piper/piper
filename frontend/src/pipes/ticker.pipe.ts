import { DestroyRef, Pipe, PipeTransform } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BehaviorSubject, Observable, skip } from "rxjs";
import { createLogger, LogLevel } from "src/utils/logger";

const logger = createLogger("ticker", LogLevel.debug);

@Pipe({
  name: "ticker",
  standalone: false,
})
export class TickerPipe<T> implements PipeTransform {
  private ticker: BehaviorSubject<T>;
  private timer: any | null = null;

  constructor(private destroyRef: DestroyRef) {
    destroyRef.onDestroy(() => {
      this.ticker?.complete();
      clearTimeout(this.timer);
    });
  }

  transform(value: BehaviorSubject<T>, interval: number = 1000): Observable<T> {
    if (!this.ticker) {
      logger.debug("Start ticker");
      this.ticker = new BehaviorSubject<T>(value.value);
      value
        .pipe(takeUntilDestroyed(this.destroyRef), skip(1))
        .subscribe((v: T) => {
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
}
