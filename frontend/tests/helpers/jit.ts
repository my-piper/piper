import { Type } from "@angular/core";

/**
 * Pipes extending the `@Directive()` base `UntilDestroyed` inherit its static
 * `ɵdir` through the prototype chain. AOT builds ignore it, but TestBed's JIT
 * module verification then reports "Directive X has no selector". Shadowing
 * the inherited definition makes JIT treat such pipes exactly like AOT does.
 */
export function asJitPipes<T extends Type<unknown>[]>(...pipes: T): T {
  for (const pipe of pipes) {
    if (!Object.prototype.hasOwnProperty.call(pipe, "ɵdir")) {
      Object.defineProperty(pipe, "ɵdir", { value: null, configurable: true });
    }
  }
  return pipes;
}
