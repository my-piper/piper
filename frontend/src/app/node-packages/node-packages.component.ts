import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import { delay, finalize, map, merge, takeUntil } from "rxjs";
import { PackageUpdatedEvent } from "src/models/events";
import { NodePackage, NodePackageUpdatesState } from "src/models/node-package";
import { HttpService } from "src/services/http.service";
import { LiveService } from "src/services/live.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";
import { EditPackageComponent } from "./edit/edit-package.component";
import { ImportPackageComponent } from "./import/import-package.component";

@Component({
  selector: "app-node-packages",
  templateUrl: "./node-packages.component.html",
  styleUrls: ["./node-packages.component.scss"],
})
export class NodePackagesComponent extends UntilDestroyed {
  private _modal!: EditPackageComponent | ImportPackageComponent;

  error!: Error;
  progress = {
    loading: { packages: false, state: false },
    checking: false,
    updating: false,
    deleting: false,
  };

  state: NodePackageUpdatesState;
  references: { popover: PopoverComponent } = { popover: null };

  set modal(modal: EditPackageComponent | ImportPackageComponent) {
    this._modal = modal;
    if (!!modal) {
      if (modal instanceof EditPackageComponent) {
        modal.added.subscribe((nodePackage) =>
          this.packages.unshift(nodePackage)
        );
        modal.saved.subscribe((nodePackage) => {
          const index = this.packages.findIndex(
            (u) => u._id === nodePackage._id
          );
          debugger;
          if (index !== -1) {
            assign(this.packages[index], nodePackage);
            this.cd.detectChanges();
          }
        });

        merge(modal.added, modal.saved).subscribe(() =>
          this.router.navigate(["./"], { relativeTo: this.route })
        );
      } else if (modal instanceof ImportPackageComponent) {
        modal.imported.subscribe(() => this.load());
      }
    }
  }

  get modal() {
    return this._modal;
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
    private cd: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit() {
    this.load();
    this.loadUpdatesState();
    this.listen();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.subscriptions.updatingPackages?.();
  }

  private listen() {
    this.subscriptions.updatingPackages =
      this.live.subscribe("updating_packages");
    this.live.socket
      .fromEvent("package_updated")
      .pipe(
        takeUntil(this.destroyed$),
        map((json) => plainToInstance(PackageUpdatedEvent, json))
      )
      .subscribe(() => this.load());
  }

  private load() {
    this.progress.loading.packages = true;
    this.cd.detectChanges();

    this.http
      .get("nodes/packages")
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) => plainToInstance(NodePackage, plain))
        ),
        finalize(() => {
          this.progress.loading.packages = false;
          this.cd.detectChanges();
        })
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
      .get("nodes/packages-updates-state")
      .pipe(
        delay(UI_DELAY),
        map((plain) => plainToInstance(NodePackageUpdatesState, plain)),
        finalize(() => {
          this.progress.loading.state = false;
          this.cd.detectChanges();
        })
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
    this.references.popover?.hide();
    this.progress.checking = true;
    this.cd.detectChanges();

    this.http
      .get("nodes/check-packages-updates")
      .pipe(
        delay(UI_DELAY),
        map((plain) => plainToInstance(NodePackageUpdatesState, plain)),
        finalize(() => {
          this.progress.checking = false;
          this.cd.detectChanges();
        })
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
      .get("nodes/update-packages")
      .pipe(
        delay(UI_DELAY),
        map((plain) => plainToInstance(NodePackageUpdatesState, plain)),
        finalize(() => {
          this.progress.updating = false;
          this.cd.detectChanges();
        })
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
    this.references?.popover?.hide();
    this.progress.deleting = true;
    this.cd.detectChanges();

    this.http
      .delete(`node-packages/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.deleting = false;
          this.cd.detectChanges();
        })
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
