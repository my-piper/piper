import { ChangeDetectorRef, Component } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { ProjectManager } from "src/services/project.manager";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-pipeline-tools",
  templateUrl: "./pipeline-tools.component.html",
  styleUrls: ["./pipeline-tools.component.scss"],
})
export class PipelineToolsComponent {
  progress: {
    publishing: boolean;
    published: string[];
  } = { publishing: false, published: [] };
  error: Error | null = null;
  project!: Project;

  form = this.fb.group({
    version: this.fb.control<number>(10),
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
    });
  }

  async publish() {
    const { version } = this.form.getRawValue();

    for (const node of this.project.pipeline.nodes.values()) {
      if (!node.catalog) {
        continue;
      }
      node.catalog.version = version;
    }

    this.projectManager.markDirty();

    this.progress.publishing = true;
    this.progress.published = [];
    this.cd.detectChanges();

    for (const [id, node] of this.project.pipeline.nodes) {
      if (!node.catalog) {
        continue;
      }

      try {
        await firstValueFrom(this.http.post("nodes", toPlain(node)));
        this.progress.published.push(node._id);
      } catch (err) {
        this.error = err as Error;
        break;
      }

      this.progress.published.push(id);
    }

    this.progress.publishing = false;
    this.cd.detectChanges();
  }
}
