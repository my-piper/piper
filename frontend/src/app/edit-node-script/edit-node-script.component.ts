import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { delay, finalize, map } from "rxjs";
import { NodeExecution } from "src/enums/node-execution";
import { AppError } from "src/models/errors";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-node-script",
  templateUrl: "./edit-node-script.component.html",
  styleUrls: ["./edit-node-script.component.scss"],
})
export class EditNodeScriptComponent implements OnInit {
  nodeExecution = NodeExecution;

  progress = { saving: false };
  error!: AppError;

  project!: Project;
  id!: string;
  node!: Node;

  form = this.fb.group({
    execution: this.fb.control<NodeExecution>(NodeExecution.regular),
    script: this.fb.control<string>(null),
  });

  constructor(
    private projectManager: ProjectManager,
    private http: HttpService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });
  }

  private build() {
    const { execution, script } = this.node;
    this.form.patchValue({
      execution,
      script,
    });
  }

  refactor() {
    let { script } = this.form.getRawValue();
    script = script
      .replaceAll("DEFINITIONS;", 'require("@piper/node");')
      .replaceAll("RepeatNode.from(", "repeat(")
      .replaceAll("RepeatNode", "repeat")
      .replaceAll("NextNode.from(", "next(")
      .replaceAll("NextNode", "next")
      .replaceAll("throw new FatalError(", "throwError.fatal(")
      .replaceAll("throw new DataError(", "throwError.data(")
      .replaceAll("throw new TimeoutError(", "throwError.timeout(")
      .replaceAll("FatalError", "throwError")
      .replaceAll("TimeoutError", "throwError")
      .replaceAll("FatalError", "throwError")
      .replaceAll(/\b(throwError)(?:\s*,\s*\1)+/g, "$1")
      .replaceAll("await httpClient", "await httpRequest")
      .replaceAll(
        /env\.variables\.get\(\s*(['"`])([A-Za-z_$][A-Za-z0-9_$]*)\1\s*\)/g,
        "env.variables.$2"
      )
      .replaceAll(
        /env\?\.variables\?\.get\(\s*(['"`])([A-Za-z_$][A-Za-z0-9_$]*)\1\s*\)/g,
        "env.variables.$2"
      )
      .replaceAll(
        /env\?\.variables\.get\(\s*(['"`])([A-Za-z_$][A-Za-z0-9_$]*)\1\s*\)/g,
        "env.variables.$2"
      );
    this.form.patchValue({ script });
  }

  save() {
    this.progress.saving = true;
    this.cd.detectChanges();

    const { execution, script } = this.form.getRawValue();

    const node = toInstance(
      {
        ...toPlain(this.node),
        script,
      },
      Node
    );

    this.http
      .post("nodes/get-sign", toPlain(node), { responseType: "text" })
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.saving = false;
          this.cd.detectChanges();
        }),
        map((sign) => sign as string)
      )
      .subscribe({
        next: (sign) => {
          assign(this.node, { execution, script, sign });
          this.projectManager.markDirty();
        },
        error: (err) => (this.error = err),
      });
  }
}
