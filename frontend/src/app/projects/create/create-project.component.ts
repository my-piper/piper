import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TuiAutoFocus } from "@taiga-ui/cdk";
import {
  TuiButton,
  TuiInput,
  TuiLabel,
  TuiNotification,
  TuiTextfield,
} from "@taiga-ui/core";
import { TuiButtonLoading } from "@taiga-ui/kit";
import { delay, map } from "rxjs";
import { UI_DELAY } from "src/consts/ui";
import { ConflictError, DisplayError } from "src/models/errors";
import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { toInstance, toPlain } from "src/utils/models";

export const TITLE_MIN_LENGTH = 5;
export const TITLE_MAX_LENGTH = 160;

/** The title as saved, without outer spaces, within the length limits. */
function titleLength({ value }: AbstractControl): ValidationErrors | null {
  const { length } = (value as string | null)?.trim() ?? "";
  return length >= TITLE_MIN_LENGTH && length <= TITLE_MAX_LENGTH
    ? null
    : { length: true };
}

/** An empty Pipeline the new Project starts from, named after its title. */
function emptyPipeline(name: string) {
  return toInstance(
    {
      name,
      version: 1,
      layout: { left: 200, top: 200, zoom: 1 },
      start: { nodes: [] },
      inputs: {},
      outputs: {},
      flows: {},
      nodes: {},
    },
    Pipeline,
  );
}

/**
 * The New project dialog: asks for the project's details (only its title
 * for now), creates the project and opens it.
 */
@Component({
  selector: "app-create-project",
  templateUrl: "./create-project.component.html",
  styleUrls: ["./create-project.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TuiAutoFocus,
    TuiButton,
    TuiButtonLoading,
    ...TuiInput,
    TuiLabel,
    ...TuiNotification,
    ...TuiTextfield,
  ],
})
export class CreateProjectComponent {
  private readonly http = inject(HttpService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cd = inject(ChangeDetectorRef);

  readonly maxLength = TITLE_MAX_LENGTH;

  progress = { creating: false };
  error: DisplayError | null = null;

  form = inject(FormBuilder).group({
    title: [null as string | null, [Validators.required, titleLength]],
  });

  create() {
    if (this.form.invalid || this.progress.creating) {
      return;
    }

    this.error = null;
    this.progress.creating = true;
    this.form.disable();
    this.cd.markForCheck();

    const title = this.form.getRawValue().title.trim();
    const request = new Project({
      title,
      pipeline: emptyPipeline(title),
      launchRequest: toInstance({ nodes: {}, inputs: {} }, LaunchRequest),
    });
    this.http
      .post("projects", toPlain(request))
      .pipe(
        delay(UI_DELAY),
        map((json) => toInstance(json as object, Project)),
      )
      .subscribe({
        next: ({ _id }) =>
          this.router.navigate(["..", _id], { relativeTo: this.route }),
        error: (err: DisplayError) => {
          this.progress.creating = false;
          // enabling validates again, so the server's verdict comes after
          this.form.enable();
          if (err instanceof ConflictError) {
            this.form.controls.title.setErrors({ taken: true });
            this.form.controls.title.markAsTouched();
          } else {
            this.error = err;
          }
          this.cd.markForCheck();
        },
      });
  }
}
