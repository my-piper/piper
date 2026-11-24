import { Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { toInstance } from "src/utils/models";

/**
 * Imports a Pipeline in the current format as a new Project.
 */
@Injectable({ providedIn: "root" })
export class PipelineImportService {
  constructor(private http: HttpService) {}

  import(yaml: string): Observable<Project> {
    return this.http
      .post("pipelines/import", { yaml })
      .pipe(map((json) => toInstance(json as object, Project)));
  }
}
