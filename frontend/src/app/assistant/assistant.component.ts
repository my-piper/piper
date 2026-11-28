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
import { ActivatedRoute, NavigationEnd, Router } from "@angular/router";
import { delay, filter, finalize, map } from "rxjs";
import { AssistantRequest, ChatMessage } from "src/models/assistant-answer";
import { Node } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/consts/ui";
import { PipelineEditor } from "src/utils/pipeline-editor";
import { toInstance, toPlain } from "src/utils/models";
import { getMergedData } from "../utils/route";

@Component({
  selector: "app-assistant",
  templateUrl: "./assistant.component.html",
  styleUrls: ["./assistant.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AssistantComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  error!: Error;
  progress = { loading: false, sending: false, clearing: false };

  project!: Project;
  /** The assistant's changes to the project's pipeline; each one is saved. */
  private editor!: PipelineEditor;
  node!: { id: string; node: Node };
  messages: ChatMessage[] = [];

  questionControl = this.fb.control<string>(null);
  form = this.fb.group({
    question: this.questionControl,
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ project }) => {
        [this.project] = [project];
        this.editor = new PipelineEditor(
          project.pipeline,
          project.launchRequest,
        );
        this.editor.changed
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.projectManager.markDirty());
        this.load();
      });

    const readData = () => {
      const { node } = getMergedData(this.route.root);
      this.node = node;
    };
    readData();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => readData());
  }

  load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(`projects/${this.project._id}/assistant/chat`)
      .pipe(
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((json) =>
          (json as object[]).map((j: object) => toInstance(j, ChatMessage)),
        ),
      )
      .subscribe((messages) => {
        this.messages = messages;
        this.cd.detectChanges();
      });
  }

  send() {
    this.questionControl.disable();
    const { question } = this.form.getRawValue();

    setTimeout(() => {
      this.messages.push(
        toInstance({ from: "user", message: question }, ChatMessage),
      );
      this.questionControl.setValue(null);
      this.questionControl.enable();
    }, 100);

    const request = toInstance(
      {
        activeNode: this.node?.id,
        question,
      },
      AssistantRequest,
    );

    this.progress.sending = true;
    this.cd.detectChanges();

    this.http
      .post(`projects/${this.project._id}/assist`, toPlain(request))
      .pipe(
        finalize(() => {
          this.progress.sending = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as object, ChatMessage)),
      )
      .subscribe((message) => {
        this.messages.push(message);
        const { changes } = message;
        if (changes) {
          const { layout } = this.project.pipeline;
          const { editor } = this;

          for (const { action, catalog, data } of changes) {
            switch (action) {
              case "add_node_from_catalog": {
                this.http
                  .get(`nodes/${catalog.id}`)
                  .pipe(map((obj) => toInstance(obj as object, Node)))
                  .subscribe({
                    next: (node) =>
                      editor.addNode(node, {
                        at: {
                          x: layout.left + Math.random() * 400 + 100,
                          y: layout.top + Math.random() * 400 + 100,
                        },
                      }),
                    error: (err) => (this.error = err),
                  });
                break;
              }
              case "add_node":
                editor.addNode(toInstance(data.json, Node), { id: data.id });
                break;
              case "replace_node":
                editor.replaceNode(data.id, toInstance(data.json, Node));
                break;
              case "remove_node":
                editor.removeNode(data.id);
                break;
              case "add_flow": {
                const { from, output, to, input, transformer } = toInstance(
                  data.json,
                  NodeFlow,
                );
                editor.connect(
                  { node: from, output },
                  { node: to, input },
                  transformer,
                );
                break;
              }
            }
          }

          this.cd.detectChanges();
        }
      });
  }

  clear() {
    this.progress.clearing = true;
    this.cd.detectChanges();

    this.http
      .post(`projects/${this.project._id}/assistant/clear`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.clearing = false;
          this.cd.detectChanges();
        }),
      )
      .subscribe(() => {
        this.messages = [];
        this.cd.detectChanges();
      });
  }
}
