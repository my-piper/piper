import { Pipe, PipeTransform } from "@angular/core";
import { orderBy } from "lodash";

@Pipe({ name: "orderBy" })
export class OrderByPipe implements PipeTransform {
  transform(
    arr: any[],
    fields: string[],
    orders: ("asc" | "desc")[] = ["asc"]
  ): any[] {
    return orderBy(arr, fields, orders);
  }
}
