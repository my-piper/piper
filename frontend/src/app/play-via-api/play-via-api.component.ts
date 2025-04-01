import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { delay, finalize, map } from "rxjs";
import { AppConfig } from "src/models/app-config";
import { Authorization } from "src/models/authorisation";
import { Deploy } from "src/models/deploy";
import { AppError } from "src/models/errors";
import { LaunchRequest } from "src/models/launch-request";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/ui-kit/consts";
import { toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-play-via-api",
  templateUrl: "./play-via-api.component.html",
  styleUrls: ["./play-via-api.component.scss"],
})
export class PlayViaApiComponent {
  progress = { generating: false };
  error!: AppError;

  deploy!: Deploy;
  launchRequest!: object;
  authorization!: Authorization;

  constructor(
    private http: HttpService,
    public config: AppConfig,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ deploy }) => {
      this.deploy = deploy;
      this.build();
    });
  }

  private build() {
    const inputs = new Map<string, Primitive>();
    const { pipeline, launchRequest } = this.deploy;
    for (const [key, value] of pipeline.inputs) {
      if (value.required) {
        inputs.set(key, launchRequest.inputs.get(key) || value.default);
      }
    }
    this.launchRequest = toPlain(new LaunchRequest({ inputs }));
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
      .post("me/api-token/generate")
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.generating = false;
          this.cd.detectChanges();
        }),
        map((json) => toInstance(json as Object, Authorization))
      )
      .subscribe({
        next: (authorization) => {
          this.authorization = authorization;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
