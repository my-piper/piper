import { Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { toInstance } from "src/utils/models";

/** A Project imported from Piper v1, with the Script Nodes to rewrite. */
export type V1PipelineImport = { project: Project; warnings: string[] };

/**
 * Imports a Pipeline copied from Piper v1 as a new Project; the server brings
 * its Nodes onto the installed Node Definitions or Script Nodes, and warns
 * about the Script Nodes that need rewriting before they run.
 */
@Injectable({ providedIn: "root" })
export class V1PipelineImportService {
  constructor(private http: HttpService) {}

  import(yaml: string): Observable<V1PipelineImport> {
    return this.http.post("pipelines/import/v1", { yaml }).pipe(
      map((json) => {
        const { warnings, ...project } = json as { warnings?: string[] };
        return {
          project: toInstance(project, Project),
          warnings: warnings ?? [],
        };
      }),
    );
  }
}
