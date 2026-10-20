import { Injectable } from "@angular/core";
import { CanDeactivate } from "@angular/router";
import { concatMap, defer, first, map, Observable, tap } from "rxjs";
import { ProjectComponent } from "src/app/project/project.component";
import { ProjectManager } from "src/services/project.manager";

@Injectable({ providedIn: "root" })
export class SaveProjectGuard implements CanDeactivate<ProjectComponent> {
  constructor(private projectManager: ProjectManager) {}

  canDeactivate(component: ProjectComponent): Observable<boolean> {
    const save = defer(() => {
      this.projectManager.kick();
      return this.projectManager.status.pipe(
        first((status) => status === "saved"),
      );
    });

    // A save already in flight does not include later edits: save once more.
    return save.pipe(
      concatMap(() => save),
      tap(() => (this.projectManager.project = null)),
      map(() => true),
    );
  }
}
