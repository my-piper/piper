import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { delay, finalize, map } from "rxjs";
import { ApiKey } from "src/models/api-key";
import { AppConfig } from "src/models/app-config";
import { AppError } from "src/models/errors";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-play-via-api",
  templateUrl: "./play-via-api.component.html",
  styleUrls: ["./play-via-api.component.scss"],
})
export class PlayViaApiComponent {
  progress = { generating: false };
  error!: AppError;

  project!: Project;
  inputs: { [key: string]: Primitive } = {};
  key!: ApiKey;

  constructor(
    private http: HttpService,
    public config: AppConfig,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
    });
  }

  private build() {
    const { pipeline, launchRequest } = this.project;
    for (const [key, value] of pipeline.inputs) {
      this.inputs[key] = launchRequest.inputs.get(key) || value.default;
    }
    this.cd.detectChanges();
  }

  generateToken() {
    if (
      !confirm(
        $localize`:@@message.confirm_generate_api_key:Previously generated key will be invalid`
      )
    ) {
      return;
    }

    this.progress.generating = true;
    this.cd.detectChanges();

    this.http
      .post("me/api-key/generate")
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.generating = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, ApiKey))
      )
      .subscribe({
        next: (key) => {
          this.key = key;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
