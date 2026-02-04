import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, NavigationEnd, Router } from "@angular/router";
import { assign } from "lodash";
import { delay, filter, finalize, map } from "rxjs";
import { AssistantRequest, ChatMessage } from "src/models/assistant-answer";
import { Node } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { sid } from "src/ui-kit/utils/string";
import { toInstance, toPlain } from "src/utils/models";
import { getMergedData } from "../utils/route";

@Component({
  selector: "app-assistant",
  templateUrl: "./assistant.component.html",
  styleUrls: ["./assistant.component.scss"],
})
export class AssistantComponent implements OnInit {
  error!: Error;
  progress = { loading: false, sending: false, clearing: false };

  project!: Project;
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
    this.route.data.subscribe(({ project }) => {
      [this.project] = [project];
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
          (json as object[]).map((j: Object) => toInstance(j, ChatMessage)),
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
        map((json) => toInstance(json as Object, ChatMessage)),
      )
      .subscribe((message) => {
        this.messages.push(message);
        const { changes } = message;
        if (!!changes) {
          const {
            pipeline: { layout, nodes, flows },
          } = this.project;

          for (const { action, catalog, data } of changes) {
            switch (action) {
              case "add_node_from_catalog": {
                this.http
                  .get(`nodes/${catalog.id}`)
                  .pipe(map((obj) => toInstance(obj as object, Node)))
                  .subscribe({
                    next: (node) => {
                      const id = `${node._id}_${sid()}`;
                      nodes.set(id, node);
                      const left = layout.left + Math.random() * 400 + 100;
                      const top = layout.top + Math.random() * 400 + 100;
                      assign(node.arrange, { x: left, y: top });
                    },
                    error: (err) => (this.error = err),
                  });
                break;
              }
              case "add_node": {
                const node = toInstance(data.json, Node);
                nodes.set(data.id, node);
                break;
              }
              case "replace_node": {
                const {
                  arrange: { x, y },
                } = nodes.get(data.id);
                const node = toInstance(data.json, Node);
                assign(node.arrange, { x, y });
                nodes.set(data.id, node);
                break;
              }
              case "remove_node":
                nodes.delete(data.id);
                break;
              case "add_flow":
                const flow = toInstance(data.json, NodeFlow);
                flows.set(data.id, flow);
                break;
            }
          }

          this.projectManager.markDirty();
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
