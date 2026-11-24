import { Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { toInstance } from "src/utils/models";

/**
 * Imports a Pipeline copied from Piper v1 as a new Project; the server brings
 * its Nodes onto the installed Node Definitions or Script Nodes.
 */
@Injectable({ providedIn: "root" })
export class V1PipelineImportService {
  constructor(private http: HttpService) {}

  import(yaml: string): Observable<Project> {
    return this.http
      .post("pipelines/import/v1", { yaml })
      .pipe(map((json) => toInstance(json as object, Project)));
  }
}
