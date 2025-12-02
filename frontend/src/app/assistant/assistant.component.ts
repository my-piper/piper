import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { assign } from "lodash";
import { delay, finalize, map } from "rxjs";
import { ChatMessage } from "src/models/assistant-answer";
import { Node } from "src/models/node";
import { NodeFlow } from "src/models/node-flow";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-assistant",
  templateUrl: "./assistant.component.html",
  styleUrls: ["./assistant.component.scss"],
})
export class AssistantComponent implements OnInit {
  error!: Error;
  progress = { loading: false, sending: false, clearing: false };

  project!: Project;
  messages: ChatMessage[] = [];

  queryControl = this.fb.control<string>(null);

  form = this.fb.group({
    query: this.queryControl,
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      [this.project] = [project];
      this.load();
    });
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
          (json as object[]).map((j: Object) => toInstance(j, ChatMessage))
        )
      )
      .subscribe((messages) => {
        this.messages = messages;
        this.cd.detectChanges();
      });
  }

  send() {
    this.queryControl.disable();
    const { query } = this.form.getRawValue();

    setTimeout(() => {
      this.messages.push(
        toInstance({ from: "user", message: query }, ChatMessage)
      );
      this.queryControl.setValue(null);
      this.queryControl.enable();
    }, 100);

    this.progress.sending = true;
    this.cd.detectChanges();

    this.http
      .post(`projects/${this.project._id}/assist`, query)
      .pipe(
        finalize(() => {
          this.progress.sending = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, ChatMessage))
      )
      .subscribe((message) => {
        this.messages.push(message);
        const { changes } = message;
        if (!!changes) {
          const {
            pipeline: { nodes, flows },
          } = this.project;

          for (const { action, data } of changes) {
            switch (action) {
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
        })
      )
      .subscribe(() => {
        this.messages = [];
        this.cd.detectChanges();
      });
  }
}
