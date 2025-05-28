import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import first from "lodash/first";
import { debounceTime, delay, finalize, map } from "rxjs";
import { Asset, AssetsFilter } from "src/models/assets";
import { AssetImportedSignal } from "src/models/signals/asset";
import { HttpService } from "src/services/http.service";
import { SignalsService } from "src/services/signals.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { valuable } from "src/utils/assign";
import { mapTo, toInstance, toPlain } from "src/utils/models";

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

  folders: string[] = [];
  assets: Asset[] = [];
  references: { popover: PopoverComponent } = { popover: null };

  @Output()
  selected = new EventEmitter<Asset>();

  folderNameControl = this.fb.control<string>(null);
  folderControl = this.fb.control<string>(null);
  form = this.fb.group({
    folder: this.folderControl,
  });

  constructor(
    private http: HttpService,
    private signals: SignalsService,
    private fb: FormBuilder,
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

    this.form.valueChanges
      .pipe(debounceTime(1000))
      .subscribe(() => this.loadAssets());

    this.loadFolders();
    this.loadAssets();
  }

  filterFolder(folder: string) {
    this.form.patchValue({ folder }, { emitEvent: false });
    this.loadAssets();

    this.references.popover?.hide();
  }

  clearFilter() {
    this.form.patchValue({ folder: null }, { emitEvent: false });
    this.loadAssets();
  }

  private loadFolders() {
    const filter = mapTo(
      {
        ...this.filter,
        ...this.form.getRawValue(),
      },
      AssetsFilter
    );

    this.http
      .get("assets/folders", valuable(toPlain(filter)))
      .pipe(
        delay(UI_DELAY),
        map((arr) => arr as string[])
      )
      .subscribe({
        next: (folders) => {
          this.folders = folders;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  private loadAssets() {
    this.progress.loading = true;
    this.cd.detectChanges();

    const filter = mapTo(
      {
        ...this.filter,
        ...this.form.getRawValue(),
      },
      AssetsFilter
    );

    this.http
      .get("assets", valuable(toPlain(filter)))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as Object[]).map((plain) => toInstance(plain, Asset)))
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
    const { folder } = this.form.getRawValue();
    if (!!folder) {
      formData.append("folder", folder);
    }
    formData.append("file", file);

    this.http
      .post("assets", formData)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.uploading = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, Asset))
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
