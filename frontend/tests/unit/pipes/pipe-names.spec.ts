import {
  Type,
  ɵtransitiveScopesFor as transitiveScopesFor,
} from "@angular/core";
import { AppModule } from "src/app/app.module";

// Angular has no public API listing an NgModule's pipe scope, so this reads
// the compiled scope and pipe definitions (re-check after Angular upgrades).
type CompiledPipeClass = Type<unknown> & { ɵpipe: { name: string } };

describe("AppModule pipes", () => {
  it("resolves every pipe name to exactly one pipe", () => {
    const pipes = [
      ...transitiveScopesFor(AppModule).compilation.pipes,
    ] as CompiledPipeClass[];

    const classesByName = new Map<string, string[]>();
    for (const pipe of pipes) {
      const name = pipe.ɵpipe.name;
      classesByName.set(name, [...(classesByName.get(name) ?? []), pipe.name]);
    }
    const duplicates = [...classesByName].filter(
      ([, classes]) => classes.length > 1,
    );

    expect(duplicates).toEqual([]);
  });
});
