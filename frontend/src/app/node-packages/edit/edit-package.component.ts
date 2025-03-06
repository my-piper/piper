import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { AppError } from "src/models/errors";
import { NodePackage } from "src/models/node-package";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-package",
  templateUrl: "./edit-package.component.html",
  styleUrls: ["./edit-package.component.scss"],
})
export class EditPackageComponent implements OnInit {
  schemas = SCHEMAS;

  progress = { saving: false };
  error!: AppError;

  nodePackage!: NodePackage;

  @Output()
  added = new EventEmitter<NodePackage>();

  @Output()
  saved = new EventEmitter<NodePackage>();

  packageControl = this.fb.control<object>(null);
  form = this.fb.group({
    nodePackage: this.packageControl,
  });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ nodePackage }) => {
      this.nodePackage = nodePackage;
      this.build();
    });
  }

  private build() {
    if (!!this.nodePackage) {
      this.form.patchValue({
        nodePackage: toPlain(this.nodePackage),
      });
    }
  }

  save() {
    this.progress.saving = true;
    this.cd.detectChanges();

    const { nodePackage } = this.form.getRawValue();
    this.http
      .post(
        !!this.nodePackage
          ? `nodes/packages/${this.nodePackage._id}`
          : "nodes/packages",
        toPlain(nodePackage)
      )
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.saving = false;
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(NodePackage, json as Object))
      )
      .subscribe({
        next: (nodePackage) => {
          if (!!this.nodePackage) {
            this.saved.emit(nodePackage);
          } else {
            this.added.emit(nodePackage);
          }
        },
        error: (err) => (this.error = err),
      });
  }
}
