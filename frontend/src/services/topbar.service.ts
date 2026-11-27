import { Injectable, signal, TemplateRef } from "@angular/core";

type Template = TemplateRef<unknown>;

/**
 * Lets routed pages fill the app top bar: `content` (breadcrumbs, a page's
 * own tabs) replaces the section crumb, and `actions` (run state, the primary
 * action) sits at the end before the user menu. A page sets its template when
 * it appears and clears it when it goes.
 */
@Injectable({ providedIn: "root" })
export class TopbarService {
  readonly content = signal<Template | null>(null);
  readonly actions = signal<Template | null>(null);

  set(template: Template) {
    this.content.set(template);
  }

  /** Clears the bar only if `template` still fills it. */
  clear(template: Template) {
    if (this.content() === template) {
      this.content.set(null);
    }
  }

  setActions(template: Template) {
    this.actions.set(template);
  }

  /** Clears the actions only if `template` still fills them. */
  clearActions(template: Template) {
    if (this.actions() === template) {
      this.actions.set(null);
    }
  }
}
