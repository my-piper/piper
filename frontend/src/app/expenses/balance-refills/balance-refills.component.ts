import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { plainToInstance } from "class-transformer";
import last from "lodash/last";
import { delay, finalize, map } from "rxjs";
import { UI, UI_DELAY } from "src/consts/ui";
import { BalanceRefill } from "src/models/balance-refill";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { toPlain } from "src/utils/models";
import { BalanceRefillsFilter } from "./models";

@Component({
  selector: "app-balance-refills",
  templateUrl: "./balance-refills.component.html",
  styleUrls: ["./balance-refills.component.scss"],
})
export class BalanceRefillsComponent implements OnInit {
  ui = UI;
  userRole = UserRole;

  error!: Error;
  progress = { loading: false };

  chunk: BalanceRefill[] = [];
  refills: BalanceRefill[] = [];

  constructor(
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.load();
  }

  loadMore() {
    const refill = last(this.refills);
    if (!!refill) {
      this.load(refill.cursor);
    }
  }

  private async load(cursor: string | null = undefined) {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("balance-refills", toPlain(new BalanceRefillsFilter({ cursor })))
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) =>
            plainToInstance(BalanceRefill, plain)
          )
        ),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (refills) => {
          this.chunk = refills;
          this.refills.push(...refills);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
