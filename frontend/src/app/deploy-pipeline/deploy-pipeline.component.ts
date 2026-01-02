import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import assign from "lodash/assign";
import { debounceTime, delay, finalize, map } from "rxjs";
import { Deploy } from "src/models/deploy";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import SCHEMAS from "src/schemas/compiled.json";
import { HttpService } from "src/services/http.service";
import { MeManager } from "src/services/me.service";
import { ProjectManager } from "src/services/project.manager";
import { UI_DELAY } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { getLabel } from "src/ui-kit/utils/i18n";
import { toInstance, toPlain } from "src/utils/models";
import { PlayViaApiComponent } from "../play-via-api/play-via-api.component";

@Component({
  selector: "app-deploy-pipeline",
  templateUrl: "./deploy-pipeline.component.html",
  styleUrls: ["./deploy-pipeline.component.scss"],
})
export class DeployPipelineComponent implements OnInit {
  schemas = SCHEMAS;
  userRole = UserRole;

  progress: {
    loading: boolean;
    deploying: boolean;
    removing: { [key: string]: boolean };
  } = {
    loading: false,
    deploying: false,
    removing: {},
  };
  error: Error;

  project!: Project;
  deploys: Deploy[] = [];

  modal!: PlayViaApiComponent;

  slugControl = this.fb.control<string>(null);
  form = this.fb.group({
    deploy: this.fb.control<object>(null),
  });

  constructor(
    private me: MeManager,
    private fb: FormBuilder,
    private projectManager: ProjectManager,
    private http: HttpService,
    private route: ActivatedRoute,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
      this.load();
    });

    this.form.valueChanges
      .pipe(debounceTime(1000))
      .subscribe(() => this.save());
  }

  build() {
    const {
      title,
      pipeline: { deploy },
    } = this.project;

    const slug =
      getLabel(title, Languages.en).toLowerCase().replace(/\s/g, "-") + "-v1";

    this.form.patchValue({
      deploy: !!deploy
        ? toPlain(deploy)
        : {
            prefix: this.me.user._id,
            slug,
          },
    });
  }

  load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get(`projects/${this.project._id}/deploys`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as Object[]).map((e) => toInstance(e, Deploy)))
      )
      .subscribe((deploys) => (this.deploys = deploys));
  }

  save() {
    const { pipeline } = this.project;
    const { deploy } = toInstance(this.form.getRawValue(), Pipeline);
    assign(pipeline, { deploy });
    this.projectManager.markDirty();
  }

  deploy() {
    this.progress.deploying = true;
    this.cd.detectChanges();

    const { deploy } = toInstance(this.form.getRawValue(), Pipeline);

    this.http
      .post(`projects/${this.project._id}/deploy`, toPlain(deploy))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.deploying = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => this.load(),
        error: (err) => (this.error = err),
      });
  }

  remove(_id: string) {
    this.progress.removing[_id] = true;
    this.cd.detectChanges();

    this.http
      .delete(`deploys/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.removing[_id] = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => this.load(),
        error: (err) => (this.error = err.error),
      });
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }
}
