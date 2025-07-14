import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { delay, finalize, map } from "rxjs";
import { PipelineNodeUpdates } from "src/models/node";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { UI, UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-update-pipeline-nodes",
  templateUrl: "./update-pipeline-nodes.component.html",
  styleUrls: ["./update-pipeline-nodes.component.scss"],
})
export class UpdatePipelineNodesComponent implements OnInit {
  ui = UI;

  error!: Error;
  progress = { loading: false };

  state: {
    updated: { all: boolean; [key: string]: boolean };
    active: string | null;
  } = {
    updated: { all: false },
    active: null,
  };

  project!: Project;

  nodeUpdates!: PipelineNodeUpdates;

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.load();
    });
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(`projects/${this.project._id}/check-node-updates`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, PipelineNodeUpdates))
      )
      .subscribe((updates) => (this.nodeUpdates = updates));
  }

  update() {
    const { active: id } = this.state;
    const { pipeline } = this.project;

    const node = this.nodeUpdates.updates.get(id);
    pipeline.nodes.set(id, node.updated);

    this.projectManager.update(this.project);

    this.state.updated[id] = true;
    this.cd.detectChanges();
  }

  updateAll() {
    const { pipeline } = this.project;
    for (const [id, node] of this.nodeUpdates.updates) {
      pipeline.nodes.set(id, node.updated);
      this.state.updated[id] = true;
    }

    this.projectManager.update(this.project);

    this.state.updated.all = true;
    this.cd.detectChanges();
  }

  select(node: string) {
    this.state.active = node;
    this.cd.detectChanges();
  }
}
