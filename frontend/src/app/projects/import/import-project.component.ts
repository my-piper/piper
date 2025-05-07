import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { delay, finalize, map } from "rxjs";
import { AppError } from "src/models/errors";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-import-project",
  templateUrl: "./import-project.component.html",
  styleUrls: ["./import-project.component.scss"],
})
export class ImportProjectComponent {
  progress = { importing: false };
  error!: AppError;

  form = this.fb.group({
    yaml: this.fb.control<string>(null),
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private router: Router,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  @Output()
  imported = new EventEmitter<Project>();

  import() {
    this.progress.importing = true;
    this.cd.detectChanges();

    const { yaml } = this.form.getRawValue();
    this.http
      .post("pipelines/import", { yaml })
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.importing = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, Project))
      )
      .subscribe({
        next: (project) => {
          this.router.navigate([".."], { relativeTo: this.route });
          this.imported.emit(project);
        },
        error: (err) => (this.error = err),
      });
  }
}
