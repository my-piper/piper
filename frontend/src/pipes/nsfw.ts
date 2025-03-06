import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "nsfw", pure: false })
export class NsfwPipe implements PipeTransform {
  transform(list: string[]): string[] {
    const allow = localStorage.getItem("nsfw") === "allow";
    return allow ? list : list.filter((i) => !/\<NSFW\>/.test(i));
  }
}
