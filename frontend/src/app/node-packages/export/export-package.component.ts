import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { delay, finalize } from "rxjs";
import { AppError } from "src/models/errors";
import { NodePackage } from "src/models/node-package";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";

@Component({
  selector: "app-export-package",
  templateUrl: "./export-package.component.html",
  styleUrls: ["./export-package.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ExportPackageComponent implements OnInit {
  progress = { loading: false };
  error!: AppError;

  nodePackage!: NodePackage;
  yaml: string;

  constructor(
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ nodePackage }) => {
      this.nodePackage = nodePackage;
      this.load();
    });
  }

  load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(
        `node-packages/${this.nodePackage._id}/export`,
        {},
        { responseType: "text" },
      )
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: (yaml) => (this.yaml = yaml as string),
        error: (err) => (this.error = err),
      });
  }
}
