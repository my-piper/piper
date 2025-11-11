import { Pipe, PipeTransform } from "@angular/core";

const GROUP_NAME_REGEX = /\<(.*?)\>/g;

@Pipe({ name: "groupList" })
export class GroupListPipe implements PipeTransform {
  transform(
    list: string[],
    tag: string
  ): { name: string; options: string[] }[] {
    const orphan: string[] = [];

    const groups: { [key: string]: string[] } = {};
    list.forEach((item) => {
      const matches = [...item.matchAll(/\<(.*?)\>/g)];
      if (matches.length > 0) {
        const title = item.replaceAll(GROUP_NAME_REGEX, "").trim();
        matches.forEach((match) => {
          const [, name] = match;
          if (!groups[name]) {
            groups[name] = [];
          }
          groups[name].push(title);
        });
      } else {
        orphan.push(item);
      }
    });

    const results = Object.keys(groups).map((key) => ({
      name: key,
      options: groups[key].sort((a, b) => a.localeCompare(b)),
    }));
    results.unshift({ name: null, options: orphan });
    return results;
  }
}
