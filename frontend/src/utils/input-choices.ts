import { GroupListPipe } from "src/pipes/group-list";
import { NsfwPipe } from "src/pipes/nsfw";

export type Choice = { value: string; label: string };
export type ChoiceGroup = { name: string | null; choices: Choice[] };

/**
 * Turns an input's enum into the choices a user picks from. An option is
 * `value` or `value|label`, and `<Name>` in an option puts it in the group
 * Name; options without a group come first. NSFW options stay hidden unless
 * the user allowed them, and empty groups are dropped.
 */
export function choiceGroups(
  options: string[] | null | undefined,
  translate: (label: string) => string,
): ChoiceGroup[] {
  const visible = new NsfwPipe().transform(options ?? []);
  return new GroupListPipe()
    .transform(visible)
    .map(({ name, options }) => ({
      name: name ? translate(name) : null,
      choices: options.map((option) => {
        const [value, label] = option.split("|");
        return { value, label: label ? translate(label) : value };
      }),
    }))
    .filter(({ choices }) => choices.length > 0);
}
