import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import {
  catchError,
  delay,
  EMPTY,
  finalize,
  map,
  of,
  skip,
  switchMap,
  takeUntil,
} from "rxjs";
import { NodeExecution } from "src/enums/node-execution";
import { AppError } from "src/models/errors";
import { Node } from "src/models/node";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/consts/ui";
import { toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-edit-node-script",
  templateUrl: "./edit-node-script.component.html",
  styleUrls: ["./edit-node-script.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditNodeScriptComponent implements OnInit {
  nodeExecution = NodeExecution;

  private destroyRef = inject(DestroyRef);
  private loadedSource = "";
  scriptLoaded = false;
  progress = { loading: false, saving: false, formatting: false };
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
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data
      .pipe(
        switchMap(({ project, node: { id, node } }) => {
          [this.project, this.id, this.node] = [project, id, node];
          this.scriptLoaded = false;
          this.error = null;
          this.form.patchValue({ execution: node.execution, script: "" });
          const script = node.script ?? "";
          if (!/^(registry:|https?:\/\/)/.test(script)) {
            return of(script);
          }
          this.progress.loading = true;
          this.form.disable();
          return this.http.post("nodes/script-source", { script }).pipe(
            map((response) => (response as { source: string }).source),
            catchError((err) => {
              this.error = err;
              return EMPTY;
            }),
            finalize(() => {
              this.progress.loading = false;
              if (!this.destroyRef.destroyed) this.cd.detectChanges();
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((source) => {
        this.loadedSource = source;
        this.form.patchValue({ script: source });
        this.form.enable();
        this.scriptLoaded = true;
        this.cd.detectChanges();
      });
  }

  format() {
    if (!this.scriptLoaded || this.progress.formatting || this.progress.saving)
      return;
    this.progress.formatting = true;
    this.cd.detectChanges();

    const { script } = this.form.getRawValue();

    this.http
      .post("utils/format-code", script, { responseType: "text" })
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.formatting = false;
          if (!this.destroyRef.destroyed) this.cd.detectChanges();
        }),
        map((script) => script as string),
        takeUntil(this.route.data.pipe(skip(1))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (script) => {
          this.form.patchValue({ script });
          this.projectManager.markDirty();
        },
        error: (err) => (this.error = err),
      });
  }

  save() {
    if (!this.scriptLoaded || this.progress.saving || this.progress.formatting)
      return;
    this.progress.saving = true;
    this.cd.detectChanges();

    const { execution, script: source } = this.form.getRawValue();
    const target = this.node;
    const changed = source !== this.loadedSource;
    const script = changed ? source : target.script;
    const base =
      changed && /^(registry:|https?:\/\/)/.test(target.script)
        ? target.script
        : undefined;

    const node = toInstance(
      {
        ...toPlain(this.node),
        script,
      },
      Node,
    );

    this.http
      .post("nodes/prepare-script", { node: toPlain(node), base })
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.saving = false;
          if (!this.destroyRef.destroyed) this.cd.detectChanges();
        }),
        map((result) => result as { script: string; sign: string }),
        takeUntil(this.route.data.pipe(skip(1))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ script, sign }) => {
          assign(target, { execution, script, sign });
          if (changed && this.node === target) {
            this.loadedSource = script;
            this.form.patchValue({ script });
          }
          this.projectManager.markDirty();
        },
        error: (err) => (this.error = err),
      });
  }
}
