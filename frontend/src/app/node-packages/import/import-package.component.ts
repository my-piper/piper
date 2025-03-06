import { ChangeDetectorRef, Component } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { delay, finalize } from "rxjs";
import { AppError } from "src/models/errors";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";

@Component({
  selector: "app-import-package",
  templateUrl: "./import-package.component.html",
  styleUrls: ["./import-package.component.scss"],
})
export class ImportPackageComponent {
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

  import() {
    this.progress.importing = true;
    this.cd.detectChanges();

    const { yaml } = this.form.getRawValue();
    this.http
      .post("nodes/import-package", { yaml })
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.importing = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => this.router.navigate([".."], { relativeTo: this.route }),
        error: (err) => (this.error = err),
      });
  }
}
