import { getDebugNode } from "@angular/core";

/**
 * The component instance rendered on a host element, for locating elements
 * by an input value. Angular no longer reflects inputs into DOM attributes,
 * and the app's DOM should not grow attributes only for tests.
 */
export function componentOf<T>(element: Element | null): T | undefined {
  return element
    ? (getDebugNode(element)?.componentInstance as T | undefined)
    : undefined;
}
