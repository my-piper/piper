import { Injectable, signal, TemplateRef } from "@angular/core";

/**
 * Lets the routed page fill the app top bar (breadcrumbs, its own tabs, page
 * actions) in place of the section crumb. The page sets its template when it
 * appears and clears it when it goes.
 */
@Injectable({ providedIn: "root" })
export class TopbarService {
  readonly content = signal<TemplateRef<unknown> | null>(null);

  set(template: TemplateRef<unknown>) {
    this.content.set(template);
  }

  /** Clears the bar only if `template` still fills it. */
  clear(template: TemplateRef<unknown>) {
    if (this.content() === template) {
      this.content.set(null);
    }
  }
}
