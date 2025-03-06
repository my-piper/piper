import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { delay, finalize } from "rxjs";
import { AppError } from "src/models/errors";
import { NodePackage } from "src/models/node-package";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import * as YAML from "yaml";

@Component({
  selector: "app-export-package",
  templateUrl: "./export-package.component.html",
  styleUrls: ["./export-package.component.scss"],
})
export class ExportPackageComponent implements OnInit {
  progress = { loading: false };
  error!: AppError;

  nodePackage!: NodePackage;
  json: Object;

  constructor(
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ nodePackage }) => {
      this.nodePackage = nodePackage;
      this.load();
    });
  }

  copy() {
    navigator.clipboard.writeText(
      YAML.stringify(this.json, {
        lineWidth: 0,
      })
    );
  }

  load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(`nodes/packages/${this.nodePackage._id}/export`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (json) => (this.json = json),
        error: (err) => (this.error = err),
      });
  }
}
