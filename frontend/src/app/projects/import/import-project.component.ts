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
import { PipelineImportService } from "src/services/pipeline-import.service";
import { UI_DELAY } from "src/consts/ui";

@Component({
  selector: "app-import-project",
  templateUrl: "./import-project.component.html",
  styleUrls: ["./import-project.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ImportProjectComponent {
  progress = { importing: false };
  error: AppError | null = null;

  form = this.fb.group({
    yaml: this.fb.control<string>(null),
  });

  constructor(
    private fb: FormBuilder,
    private pipelines: PipelineImportService,
    private router: Router,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ) {}

  @Output()
  imported = new EventEmitter<Project>();

  cancel() {
    this.router.navigate([".."], { relativeTo: this.route });
  }

  import() {
    // a failed import saved nothing: start over from the pasted YAML
    this.error = null;
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
        next: (project) => {
          this.router.navigate([".."], {
            relativeTo: this.route,
            queryParamsHandling: "preserve",
          });
          this.imported.emit(project);
        },
        error: (err) => (this.error = err),
      });
  }
}
