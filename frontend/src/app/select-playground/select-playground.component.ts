import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { plainToInstance } from "class-transformer";
import { assign } from "lodash";
import { delay, finalize, map } from "rxjs";
import { ProjectVisibility } from "src/enums/project-visibility";
import { PipelineCategory } from "src/models/pipeline-category";
import { Project, ProjectsFilter } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { valuable } from "src/utils/assign";
import { mapTo, toPlain } from "src/utils/models";

@Component({
  selector: "app-select-playground",
  templateUrl: "./select-playground.component.html",
  styleUrls: ["./select-playground.component.scss"],
})
export class SelectPlaygroundComponent {
  userRole = UserRole;

  error!: Error;
  progress = {
    loading: {
      categories: false,
      projects: false,
    },
  };

  categories: PipelineCategory[] = [];
  projects: Project[] = [];

  @Output()
  selected = new EventEmitter<Project>();

  categoryControl = this.fb.control<string>(null);
  form = this.fb.group({
    category: this.categoryControl,
  });

  constructor(
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private fb: FormBuilder
  ) {}

  async ngOnInit() {
    this.load();

    this.form.valueChanges.subscribe(() => this.loadProjects());
  }

  private async load() {
    this.loadCategories();
    this.loadProjects();
  }

  private async loadCategories() {
    this.progress.loading.categories = true;
    this.cd.detectChanges();

    this.http
      .get("projects/categories")
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) =>
            plainToInstance(PipelineCategory, plain)
          )
        ),
        finalize(() => {
          this.progress.loading.categories = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  private async loadProjects() {
    this.progress.loading.projects = true;
    this.cd.detectChanges();

    const filter = mapTo(this.form.getRawValue(), ProjectsFilter);
    assign(filter, {
      sort: "order",
      visibility: ProjectVisibility.public,
    });

    this.http
      .get("projects", valuable(toPlain(filter)))
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) => plainToInstance(Project, plain))
        ),
        finalize(() => {
          this.progress.loading.projects = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (projects) => {
          this.projects = projects;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
