import { ChangeDetectorRef, Component, Renderer2 } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { toPairs } from "lodash";
import { delay, finalize, map } from "rxjs";
import { Launch } from "src/models/launch";
import { LaunchRequest } from "src/models/launch-request";
import { Project } from "src/models/project";
import { PipelineLaunchedSignal } from "src/models/signals/launch";
import { HttpService } from "src/services/http.service";
import { SignalsService } from "src/services/signals.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-project-playground",
  templateUrl: "./project-playground.component.html",
  styleUrls: ["./project-playground.component.scss"],
})
export class ProjectPlaygroundComponent {
  progress = { launching: false };

  project!: Project;
  request!: LaunchRequest;
  version: number = 1;

  inputsGroup = this.fb.group({});
  form = this.fb.group({
    inputs: this.inputsGroup,
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private signals: SignalsService,
    private cd: ChangeDetectorRef,
    private route: ActivatedRoute,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.build();
    });

    this.form.valueChanges.subscribe(() => {
      this.fillRequest();
      this.save();
    });

    this.renderer.setProperty(
      window,
      "play",
      (data: object, element?: HTMLElement) => {
        this.inputsGroup.patchValue(data);
        if (!!element) {
          if (element instanceof HTMLButtonElement) {
            this.renderer.addClass(element, "busy");
            this.renderer.setProperty(element, "disabled", true);

            setTimeout(() => {
              this.renderer.removeClass(element, "busy");
              this.renderer.setProperty(element, "disabled", false);
            }, 1000);
          }
        }
      }
    );
  }

  private fillRequest() {
    const { inputs } = this.form.getRawValue();
    this.request = new LaunchRequest({
      inputs: new Map(toPairs(inputs)),
    });
  }

  private build() {
    const controls = Object.keys(this.inputsGroup.controls);
    for (const id of controls) {
      this.inputsGroup.removeControl(id, { emitEvent: false });
    }

    const { pipeline, launchRequest } = this.project;
    if (!!pipeline.inputs) {
      for (const [k, input] of pipeline.inputs) {
        const control = this.fb.control<Primitive>(
          null,
          input.required ? [Validators.required] : []
        );
        const value = launchRequest.inputs?.get(k) || input.default;
        if (value != null) {
          control.setValue(value);
        }

        this.inputsGroup.addControl(k, control, { emitEvent: false });
      }
    }

    const json = localStorage.getItem(this.project._id);
    if (!!json) {
      this.form.patchValue(JSON.parse(json), { emitEvent: false });
    }
    this.fillRequest();
  }

  private save() {
    console.log("Save playground form");
    localStorage.setItem(
      this.project._id,
      JSON.stringify(toPlain(this.request))
    );
  }

  launch() {
    this.progress.launching = true;
    this.cd.detectChanges();

    this.http
      .post(`projects/${this.project._id}/launch`, toPlain(this.request))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.launching = false;
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(Launch, json as Object))
      )
      .subscribe((launch) =>
        this.signals.emit(new PipelineLaunchedSignal(launch))
      );
  }
}
