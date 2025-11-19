import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { map, tap } from "rxjs";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";

@Injectable({ providedIn: "root" })
export class ProjectResolver implements Resolve<Project> {
  constructor(
    private projectManager: ProjectManager,
    private http: HttpService
  ) {}

  resolve(route: ActivatedRouteSnapshot) {
    const { id } = route.params;

    console.log("Resolve project", id);

    return this.http.get(`projects/${id}`).pipe(
      map((json) => plainToInstance(Project, json)),
      tap((project) => (this.projectManager.project = project))
    );
  }
}
