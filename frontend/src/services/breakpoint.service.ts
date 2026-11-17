import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import { Breakpoint } from "src/enums/breakpoint";

@Injectable({ providedIn: "root" })
export class BreakpointService {
  private queries = {
    [Breakpoint.mobile]: window.matchMedia(`(max-width: 425px)`),
    [Breakpoint.tablet]: window.matchMedia(
      `(min-width: 426px) and (max-width: 992px)`,
    ),
    [Breakpoint.desktop]: window.matchMedia(
      `(min-width: 993px) and (max-width: 1440px)`,
    ),
    [Breakpoint.wide]: window.matchMedia(`(min-width: 1441px)`),
  };

  current$ = new Subject<Breakpoint>();

  _current: Breakpoint | null = (() => {
    for (const i of Object.keys(this.queries)) {
      const query = this.queries[i as Breakpoint];
      if (query.matches) {
        return i as Breakpoint;
      }
    }
    return Breakpoint.desktop;
  })();

  set current(breakpoint: Breakpoint) {
    if (breakpoint !== this._current) {
      this._current = breakpoint;
      this.current$.next(breakpoint);
    }
  }

  get current() {
    return this._current;
  }

  constructor() {
    for (const i of Object.keys(this.queries)) {
      const breakpoint = i as Breakpoint;
      const query = this.queries[i as Breakpoint];
      query.addListener((q) => {
        if (q.matches) {
          this.current = breakpoint;
        }
      });
    }
  }
}
