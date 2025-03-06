import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
} from "@angular/core";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { AppConfig } from "src/models/app-config";
import { LaunchOutput } from "src/models/launch";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";

@Component({
  selector: "app-select-generated",
  templateUrl: "./select-generated.component.html",
  styleUrls: ["./select-generated.component.scss"],
})
export class SelectGeneratedComponent extends UntilDestroyed {
  progress: { loading: boolean } = {
    loading: false,
  };
  error: Error;

  references: { popover: PopoverComponent } = { popover: null };
  outputs: LaunchOutput[] = [];

  @Output()
  selected = new EventEmitter<string>();

  constructor(
    private config: AppConfig,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit() {
    this.load();
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("launches/outputs")
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) =>
          (arr as Object[]).map((e) => plainToInstance(LaunchOutput, e))
        )
      )
      .subscribe({
        next: (outputs) => {
          this.outputs = outputs;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err.error),
      });
  }

  select(url: string) {
    this.selected.emit(url);
  }
}
