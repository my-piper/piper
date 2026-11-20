import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { FormControl } from "@angular/forms";
import { delay, finalize } from "rxjs";
import { AppError } from "src/models/errors";
import { NodePackage } from "src/models/node-package";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import type { editor } from "monaco-editor";
import * as YAML from "yaml";

@Component({
  selector: "app-export-package",
  templateUrl: "./export-package.component.html",
  styleUrls: ["./export-package.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ExportPackageComponent implements OnInit {
  progress = { loading: false };
  error!: AppError;

  nodePackage!: NodePackage;
  readonly yamlControl = new FormControl("");
  nodes: { id: string; title?: string }[] = [];
  readonly editorOptions: editor.IStandaloneEditorConstructionOptions = {
    language: "yaml",
    readOnly: true,
    domReadOnly: true,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    ariaLabel: $localize`:@@label.package_yaml:Package YAML`,
  };

  constructor(
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  get yaml() {
    return this.yamlControl.value;
  }

  ngOnInit() {
    this.route.data.subscribe(({ nodePackage }) => {
      this.nodePackage = nodePackage;
      this.load();
    });
  }

  load() {
    this.yamlControl.setValue("");
    this.nodes = [];
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(
        `node-packages/${this.nodePackage._id}/export`,
        {},
        { responseType: "text" },
      )
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: (yaml) => {
          this.yamlControl.setValue(yaml as string);
          const {
            nodes = {},
          }: {
            nodes?: Record<string, { title?: string }>;
          } = YAML.parse(this.yaml);
          this.nodes = Object.entries(nodes).map(([id, node]) => ({
            id,
            title: node.title,
          }));
        },
        error: (err) => (this.error = err),
      });
  }
}
