import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { delay, finalize } from "rxjs";
import { AppError } from "src/models/errors";
import { Project } from "src/models/project";
import { V1PipelineImportService } from "src/services/v1-pipeline-import.service";
import { UI_DELAY } from "src/consts/ui";

@Component({
  selector: "app-import-v1-project",
  templateUrl: "./import-v1-project.component.html",
  styleUrls: ["../import/import-project.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
/** Imports a Pipeline copied from Piper v1 (see `V1PipelineImportService`). */
export class ImportV1ProjectComponent {
  progress = { importing: false };
  error: AppError | null = null;
  // Script Nodes of the imported Project to rewrite before they run
  warnings: string[] = [];

  form = this.fb.group({
    yaml: this.fb.control<string>(null),
  });

  constructor(
    private fb: FormBuilder,
    private pipelines: V1PipelineImportService,
    private router: Router,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {}

  @Output()
  imported = new EventEmitter<Project>();

  import() {
    // a failed import saved nothing: start over from the pasted YAML
    this.error = null;
    this.warnings = [];
    this.progress.importing = true;
    this.cd.detectChanges();

    const { yaml } = this.form.getRawValue();
    this.pipelines
      .import(yaml)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.importing = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: ({ project, warnings }) => {
          this.imported.emit(project);
          if (warnings.length > 0) {
            // stay open until the user has read which Nodes to rewrite
            this.warnings = warnings;
            return;
          }
          this.close();
        },
        error: (err) => (this.error = err),
      });
  }

  close() {
    this.router.navigate([".."], { relativeTo: this.route });
  }
}
