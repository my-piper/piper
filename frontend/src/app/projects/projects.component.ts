import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import last from "lodash/last";
import { catchError, delay, finalize, map } from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { Project, ProjectsFilter } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI, UI_DELAY } from "src/ui-kit/consts";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { toInstance, toPlain } from "src/utils/models";
import * as YAML from "yaml";

const TEST_PIPELINE = `---
name: New project
version: 1

flows: {}
start:
  nodes: []
nodes: {}
`;

const TEST_REQUEST = {
  nodes: {
    find_random_image: {
      inputs: { topic: "cats" },
    },
    resize_image: {
      inputs: { width: 1000 },
    },
  },
  inputs: {},
};

@Component({
  selector: "app-projects",
  templateUrl: "./projects.component.html",
  styleUrls: ["./projects.component.scss"],
})
export class ProjectsComponent implements OnInit {
  ui = UI;
  userRole = UserRole;

  error!: Error;
  progress = { loading: false, deleting: false };

  references: { popover: PopoverComponent } = { popover: null };

  chunk: Project[] = [];
  projects: Project[] = [];

  constructor(
    private router: Router,
    private http: HttpService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.load();
  }

  private async load(cursor?: string) {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("projects", toPlain(new ProjectsFilter({ cursor })))
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) => toInstance(plain, Project))
        ),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (projects) => {
          this.chunk = projects;
          this.projects.push(...projects);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  loadMore() {
    const project = last(this.projects);
    if (!!project) {
      this.load(project.cursor);
    }
  }

  create() {
    const request = new Project({
      title: "Test project",
      pipeline: plainToInstance(Pipeline, YAML.parse(TEST_PIPELINE)),
      launchRequest: plainToInstance(LaunchRequest, TEST_REQUEST),
    });
    this.http
      .post(`projects`, toPlain(request))
      .pipe(
        catchError((err) => (this.error = err)),
        map((json) => plainToInstance(Project, json as Object))
      )
      .subscribe((project) => {
        this.router.navigate([project._id], { relativeTo: this.route });
      });
  }

  remove(index: number, { _id }: Project) {
    this.progress.deleting = true;
    this.cd.detectChanges();

    this.http
      .delete(`projects/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.deleting = false;
          this.references?.popover?.hide();
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.projects.splice(index, 1);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
