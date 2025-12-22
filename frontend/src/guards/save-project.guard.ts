import { Injectable } from "@angular/core";
import { CanDeactivate } from "@angular/router";
import { filter, map, Observable, tap } from "rxjs";
import { ProjectComponent } from "src/app/project/project.component";
import { ProjectManager } from "src/services/project.manager";

@Injectable({ providedIn: "root" })
export class SaveProjectGuard implements CanDeactivate<ProjectComponent> {
  constructor(private projectManager: ProjectManager) {}

  canDeactivate(component: ProjectComponent): Observable<boolean> {
    this.projectManager.kick();
    return this.projectManager.status.pipe(
      filter((status) => status === "saved"),
      tap(() => (this.projectManager.project = null)),
      map(() => true)
    );
  }
}
