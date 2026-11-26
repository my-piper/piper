import {
  afterNextRender,
  signal,
  ChangeDetectorRef,
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { TUI_DIALOGS_CLOSE, TuiDialogService } from "@taiga-ui/core";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { EMPTY, delay, finalize, map, merge } from "rxjs";
import { PackageUpdatedEvent } from "src/models/events";
import { NodePackage, NodePackageUpdatesState } from "src/models/node-package";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { UI_DELAY } from "src/consts/ui";
import { EditPackageComponent } from "./edit/edit-package.component";
import { ImportPackageComponent } from "./import/import-package.component";
import { PACKAGES_ROOM } from "src/consts/rooms";

@Component({
  selector: "app-node-packages",
  templateUrl: "./node-packages.component.html",
  styleUrls: ["./node-packages.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
  providers: [
    // Keep the child router context and let the route control the dialog lifetime.
    TuiDialogService,
    { provide: TUI_DIALOGS_CLOSE, useValue: EMPTY },
  ],
})
export class NodePackagesComponent {
  private readonly destroyRef = inject(DestroyRef);

  error!: Error;
  progress = {
    loading: { packages: false, state: false },
    checking: false,
    updating: false,
    deleting: false,
  };

  state: NodePackageUpdatesState;
  readonly dialogOptions = {
    size: "l" as const,
    label: $localize`:@@link.node_packages:Node packages`,
  };

  private readonly dialogReady = signal(false);

  updatesOpen = false;
  actionsOpen: string | null = null;

  get dialogOpen() {
    return this.dialogReady() && !!this.route.firstChild;
  }

  activate(modal: unknown) {
    if (modal) {
      if (modal instanceof EditPackageComponent) {
        modal.added.subscribe((nodePackage) => {
          nodePackage.nodeCount = 0;
          this.packages.unshift(nodePackage);
        });
        modal.saved.subscribe((nodePackage) => {
          const index = this.packages.findIndex(
            (u) => u._id === nodePackage._id,
          );
          if (index !== -1) {
            nodePackage.nodeCount = this.packages[index].nodeCount;
            assign(this.packages[index], nodePackage);
            this.cd.detectChanges();
          }
        });

        merge(modal.added, modal.saved).subscribe(() =>
          this.router.navigate(["./"], { relativeTo: this.route }),
        );
      } else if (modal instanceof ImportPackageComponent) {
        modal.imported.subscribe(() => this.load());
      }
    }
  }

  packages: NodePackage[] = [];

  subscriptions: { updatingPackages: () => void } = {
    updatingPackages: null,
  };

  constructor(
    private http: HttpService,
    private live: LiveService,
    private route: ActivatedRoute,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {
    // The root popup host must exist before opening a dialog on direct route entry.
    afterNextRender(() => this.dialogReady.set(true));
  }

  ngOnInit() {
    this.load();
    this.loadUpdatesState();
    this.listen();
  }

  ngOnDestroy(): void {
    this.subscriptions.updatingPackages?.();
  }

  private listen() {
    this.subscriptions.updatingPackages = this.live.subscribe(PACKAGES_ROOM);
    this.live.socket
      .fromEvent("package_updated")
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map((json) => plainToInstance(PackageUpdatedEvent, json)),
      )
      .subscribe(() => this.load());
  }

  private load() {
    this.progress.loading.packages = true;
    this.cd.detectChanges();

    this.http
      .get("node-packages")
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as object[]).map((plain) => plainToInstance(NodePackage, plain)),
        ),
        finalize(() => {
          this.progress.loading.packages = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: (packages) => {
          this.packages = packages;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  private loadUpdatesState() {
    this.progress.loading.state = true;
    this.cd.detectChanges();

    this.http
      .get("node-packages/updates/state")
      .pipe(
        delay(UI_DELAY),
        map((plain) => plainToInstance(NodePackageUpdatesState, plain)),
        finalize(() => {
          this.progress.loading.state = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: (state) => {
          this.state = state;
          this.cd.detectChanges();

          switch (state.status) {
            case "checking":
            case "updating":
              setTimeout(() => this.loadUpdatesState(), 2000);
              break;
            default:
            // no progress...
          }
        },
        error: (err) => (this.error = err),
      });
  }

  checkUpdates() {
    this.updatesOpen = false;
    this.progress.checking = true;
    this.cd.detectChanges();

    this.http
      .post("node-packages/updates/check")
      .pipe(
        delay(UI_DELAY),
        map((plain) => plainToInstance(NodePackageUpdatesState, plain)),
        finalize(() => {
          this.progress.checking = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: (state) => {
          this.state = state;
          this.cd.detectChanges();

          setTimeout(() => this.loadUpdatesState(), 2000);
        },
        error: (err) => (this.error = err),
      });
  }

  update() {
    this.progress.updating = true;
    this.cd.detectChanges();

    this.http
      .post("node-packages/updates/apply")
      .pipe(
        delay(UI_DELAY),
        map((plain) => plainToInstance(NodePackageUpdatesState, plain)),
        finalize(() => {
          this.progress.updating = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: (state) => {
          this.state = state;
          this.cd.detectChanges();

          setTimeout(() => this.loadUpdatesState(), 2000);
        },
        error: (err) => (this.error = err),
      });
  }

  remove(index: number, { _id }: NodePackage) {
    this.actionsOpen = null;
    this.progress.deleting = true;
    this.cd.detectChanges();

    this.http
      .delete(`node-packages/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.deleting = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.packages.splice(index, 1);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }
}
