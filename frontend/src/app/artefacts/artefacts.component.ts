import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
} from "@angular/core";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { LaunchArtefact } from "src/models/launch";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { toInstance, toPlain } from "src/utils/models";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";
import { ArtefactsFilter } from "./models";

@Component({
  selector: "app-artefacts",
  templateUrl: "./artefacts.component.html",
  styleUrls: ["./artefacts.component.scss"],
})
export class ArtefactsComponent extends UntilDestroyed {
  private _filter!: ArtefactsFilter;

  progress: { loading: boolean } = {
    loading: false,
  };
  error: Error;

  @HostBinding("attr.data-mode")
  @Input()
  mode: "view" | "select" = "view";

  references: { popover: PopoverComponent } = { popover: null };
  artefacts: LaunchArtefact[] = [];

  @Input()
  set filter(filter: Partial<ArtefactsFilter>) {
    this._filter = toInstance(filter, ArtefactsFilter);
    this.load();
  }

  get filter() {
    return this._filter;
  }

  @Output()
  selected = new EventEmitter<string>();

  constructor(
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
      .get("artefacts", toPlain(this.filter))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) =>
          (arr as Object[]).map((e) => plainToInstance(LaunchArtefact, e))
        )
      )
      .subscribe({
        next: (artefacts) => {
          this.artefacts = artefacts;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err.error),
      });
  }

  select(url: string) {
    this.selected.emit(url);
  }
}
