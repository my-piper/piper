import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from "@angular/core";
import { plainToInstance } from "class-transformer";
import first from "lodash/first";
import { delay, finalize, map } from "rxjs";
import { Asset, AssetsFilter } from "src/models/assets";
import { AssetImportedSignal } from "src/models/signals/asset";
import { HttpService } from "src/services/http.service";
import { SignalsService } from "src/services/signals.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-assets",
  templateUrl: "./assets.component.html",
  styleUrls: ["./assets.component.scss"],
})
export class AssetsComponent implements OnInit {
  hostname = document.location.hostname;

  private _filter!: AssetsFilter;

  error!: Error;
  progress: {
    loading: boolean;
    uploading: boolean;
    removing: { [key: string]: boolean };
  } = {
    loading: false,
    uploading: false,
    removing: {},
  };

  @Input()
  set filter(filter: Partial<AssetsFilter>) {
    this._filter = new AssetsFilter(filter);
    this.cd.detectChanges();
  }

  get filter() {
    return this._filter;
  }

  assets: Asset[] = [];

  @Output()
  selected = new EventEmitter<Asset>();

  constructor(
    private http: HttpService,
    private signals: SignalsService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.signals.feed.subscribe((signal) => {
      if (signal instanceof AssetImportedSignal) {
        const { asset } = signal;
        this.assets.unshift(asset);
        this.cd.detectChanges();
      }
    });

    this.load();
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("assets", toPlain(this.filter))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) =>
          (arr as Object[]).map((plain) => plainToInstance(Asset, plain))
        )
      )
      .subscribe({
        next: (assets) => {
          this.assets = assets;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  upload({ target }: Event) {
    this.progress.uploading = true;
    this.cd.detectChanges();

    const t = target as HTMLInputElement;
    const file = first(t.files);
    let formData = new FormData();
    formData.append("file", file);

    this.http
      .post("assets", formData)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.uploading = false;
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(Asset, json as Object))
      )
      .subscribe({
        next: (asset) => {
          this.assets.unshift(asset);
          this.cd.detectChanges();

          this.selected.emit(asset);
        },
        error: (err) => {
          console.log(err);
        },
      });
  }

  remove(asset: Asset) {
    this.progress.removing[asset._id] = true;
    this.cd.detectChanges();

    this.http
      .delete(`assets/${asset._id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.removing[asset._id] = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          const index = this.assets.indexOf(asset);
          if (index !== -1) {
            this.assets.splice(index, 1);
          }
        },
        error: (err) => (this.error = err),
      });
  }

  select(asset: Asset) {
    this.selected.emit(asset);
  }
}
