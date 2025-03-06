import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { plainToInstance } from "class-transformer";
import last from "lodash/last";
import { delay, finalize, map } from "rxjs";
import { UI, UI_DELAY } from "src/consts/ui";
import { PipelineUsage } from "src/models/pipeline-usage";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { toPlain } from "src/utils/models";
import { PipelineUsagesFilter } from "./models";

@Component({
  selector: "app-pipeline-usages",
  templateUrl: "./pipeline-usages.component.html",
  styleUrls: ["./pipeline-usages.component.scss"],
})
export class PipelineUsagesComponent implements OnInit {
  ui = UI;
  userRole = UserRole;

  error!: Error;
  progress = { loading: false };

  chunk: PipelineUsage[] = [];
  usages: PipelineUsage[] = [];

  constructor(
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.load();
  }

  loadMore() {
    const usage = last(this.usages);
    if (!!usage) {
      this.load(usage.cursor);
    }
  }

  private async load(cursor: string | null = undefined) {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("pipeline-usages", toPlain(new PipelineUsagesFilter({ cursor })))
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) =>
            plainToInstance(PipelineUsage, plain)
          )
        ),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (usages) => {
          this.chunk = usages;
          this.usages.push(...usages);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
