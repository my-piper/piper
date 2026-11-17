import {
  Type,
  ɵtransitiveScopesFor as transitiveScopesFor,
} from "@angular/core";
import { AppModule } from "src/app/app.module";

type PipeType = Type<unknown> & { ɵpipe?: { name: string } };

describe("AppModule pipes", () => {
  it("resolves every pipe name to exactly one pipe", () => {
    const pipes = [
      ...transitiveScopesFor(AppModule).compilation.pipes,
    ] as PipeType[];

    const classesByName = new Map<string, string[]>();
    for (const pipe of pipes) {
      const name = pipe.ɵpipe!.name;
      classesByName.set(name, [...(classesByName.get(name) ?? []), pipe.name]);
    }
    const duplicates = [...classesByName].filter(
      ([, classes]) => classes.length > 1,
    );

    expect(duplicates).toEqual([]);
  });
});
