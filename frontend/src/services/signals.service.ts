import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import { Signal } from "src/models/signals/signal";

@Injectable({ providedIn: "root" })
export class SignalsService {
  feed = new Subject<Signal>();

  emit(signal: Signal) {
    this.feed.next(signal);
  }
}
