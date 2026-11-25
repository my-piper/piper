import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Project } from "src/models/project";
import SCHEMAS from "src/schemas/compiled.json";
import { ProjectManager } from "src/services/project.manager";

/**
 * The Project's Design tab: the Pipeline's name, description, tags and
 * version. A valid edit goes straight into the Project (the name is also its
 * title) and is persisted by the project autosave.
 */
@Component({
  selector: "app-edit-pipeline-design",
  templateUrl: "./edit-pipeline-design.component.html",
  styleUrls: ["./edit-pipeline-design.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditPipelineDesignComponent implements OnInit {
  project!: Project;

  form = this.fb.group({
    name: this.fb.control<string>(null, [
      Validators.required,
      Validators.pattern(SCHEMAS.pipeline.properties.name.pattern),
    ]),
    description: this.fb.control<string>(null),
    tags: this.fb.control<string[]>([]),
    version: this.fb.control<number>(null, Validators.required),
  });

  constructor(
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
    });
    this.form.valueChanges.subscribe(() => this.save());
  }

  private build() {
    const { name, description, tags, version } = this.project.pipeline;
    this.form.setValue(
      {
        name: name ?? null,
        description: description ?? null,
        tags: tags ?? [],
        version: version ?? null,
      },
      { emitEvent: false },
    );
  }

  private save() {
    if (this.form.invalid) {
      return;
    }

    const { name, description, tags, version } = this.form.getRawValue();
    this.project.title = name;
    Object.assign(this.project.pipeline, {
      name,
      description: description || undefined,
      tags: tags.length > 0 ? tags : undefined,
      version,
    });
    this.projectManager.markDirty();
  }
}
