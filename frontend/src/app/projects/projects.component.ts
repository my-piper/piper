import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { catchError, delay, finalize, map } from "rxjs";
import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI, UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";
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
  progress = { loading: false };

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

  private async load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("projects")
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) => plainToInstance(Project, plain))
        ),
        finalize(() => {
          this.progress.loading = false;
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

  remove(id: string) {
    this.http.delete(`projects/${id}`).subscribe({
      next: () => this.load(),
      error: (err) => (this.error = err),
    });
  }
}
