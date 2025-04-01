import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { delay, finalize } from "rxjs";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";

@Component({
  selector: "app-select-playground-page",
  templateUrl: "./select-playground-page.component.html",
  styleUrls: ["./select-playground-page.component.scss"],
})
export class SelectPlaygroundPageComponent {
  userRole = UserRole;

  error!: Error;
  progress = {
    organizing: false,
  };

  references: { popover: PopoverComponent } = { popover: null };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  organize() {
    this.progress.organizing = true;
    this.cd.detectChanges();

    this.http
      .post("projects/organize")
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.organizing = false;
          this.cd.detectChanges();

          this.references.popover?.hide();
        })
      )
      .subscribe({
        next: () => null,
        error: (err) => (this.error = err),
      });
  }

  go(project: Project) {
    this.router.navigate([project.slug || project._id], {
      relativeTo: this.route,
      state: { scroll: "top" },
    });
  }
}
