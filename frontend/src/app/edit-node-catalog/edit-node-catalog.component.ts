import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { delay, finalize } from "rxjs";
import { AppError } from "src/models/errors";
import { Node, NodeCatalog } from "src/models/node";
import { Project } from "src/models/project";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { getLabel } from "src/ui-kit/utils/i18n";
import { toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-node-catalog",
  templateUrl: "./edit-node-catalog.component.html",
  styleUrls: ["./edit-node-catalog.component.scss"],
})
export class EditNodeCatalogComponent implements OnInit {
  schemas = SCHEMAS;

  progress = { publishing: false };
  error!: AppError;

  project!: Project;
  id!: string;
  node!: Node;

  catalogControl = this.fb.control<object>(null);
  form = this.fb.group({
    catalog: this.catalogControl,
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
    this.form.statusChanges.subscribe((status) => {
      if (status === "VALID") {
        this.save();
      }
    });
  }

  private build() {
    const { catalog } = toPlain(this.node);
    this.form.patchValue({
      catalog,
    });
  }

  create() {
    const catalog = new NodeCatalog({
      _id: getLabel(this.node.title, Languages.en)
        .toLowerCase()
        .replace(/\s/g, "_"),
      version: 1,
      package: "some_package",
    });
    this.catalogControl.setValue(toPlain(catalog), {
      emitEvent: false,
    });
  }

  remove() {
    this.form.setValue({ catalog: null });
  }

  private save() {
    const { catalog: json } = this.form.getRawValue();
    if (!!json) {
      const catalog = toInstance(json, NodeCatalog);
      assign(this.node, { catalog });
    } else {
      delete this.node.catalog;
    }
    const { pipeline, launchRequest } = this.project;
    this.projectManager.update({ pipeline, launchRequest });
  }

  publish() {
    this.progress.publishing = true;
    this.cd.detectChanges();
    this.http
      .post("nodes", toPlain(this.node))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.publishing = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {},
        error: (err) => (this.error = err),
      });
  }
}
