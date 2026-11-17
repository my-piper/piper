import { Pipe, PipeTransform } from "@angular/core";
import { round } from "lodash";
import { BehaviorSubject, Observable } from "rxjs";

function decimalPlaces(num: number) {
  const str = num.toString();
  if (str.includes(".")) {
    return str.split(".")[1].length;
  }
  return 0;
}

@Pipe({
  name: "countdown",
  standalone: false,
})
export class CountdownPipe implements PipeTransform {
  timer: any | null = null;
  prev: number | null = null;

  transform(number: number): Observable<number> {
    clearTimeout(this.timer);
    let current = this.prev ? this.prev : number / 5;
    this.prev = number;

    const counter = new BehaviorSubject<number>(current);
    const count = () => {
      const step = Math.max(Math.abs((number - current) / 2), 0.005);
      current += (number > 0 ? 1 : -1) * step;
      current = round(current, decimalPlaces(number));
      if (number > 0 ? current < number : current > number) {
        counter.next(current);
        this.timer = setTimeout(count, 50);
      } else {
        counter.next(number);
      }
    };
    count();
    return counter;
  }
}
