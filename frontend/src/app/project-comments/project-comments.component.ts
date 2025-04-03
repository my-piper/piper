import { ChangeDetectorRef, Component } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { last } from "lodash";
import { delay, finalize, map } from "rxjs";
import { AppConfig } from "src/models/app-config";
import { AppError } from "src/models/errors";
import {
  Project,
  ProjectComment,
  ProjectCommentsFilter,
} from "src/models/project";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { mapTo, toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-project-comments",
  templateUrl: "./project-comments.component.html",
  styleUrls: ["./project-comments.component.scss"],
})
export class ProjectCommentsComponent {
  progress = {
    loading: false,
    deleting: false,
    adding: false,
    removing: {} as { [key: number]: boolean },
  };
  error!: AppError;

  project!: Project;
  chunk: ProjectComment[] = [];
  comments: ProjectComment[] = [];

  references: { popover: PopoverComponent } = { popover: null };

  messageControl = this.fb.control<string>(null, [Validators.required]);
  form = this.fb.group({
    message: this.messageControl,
  });

  constructor(
    private http: HttpService,
    public config: AppConfig,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ project }) => {
      this.project = project;
      this.loadComments();
    });
  }

  private loadComments(cursor?: string) {
    this.progress.loading = true;
    this.cd.detectChanges();

    const filter = mapTo({ cursor }, ProjectCommentsFilter);
    this.http
      .get(`projects/${this.project._id}/comments`, toPlain(filter))
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) => toInstance(plain, ProjectComment))
        ),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (comments) => {
          this.chunk = comments;
          this.comments.push(...comments);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  loadMore() {
    const comment = last(this.comments);
    if (!!comment) {
      this.loadComments(comment._id);
    }
  }

  addComment() {
    this.form.markAllAsTouched();
    if (!this.form.valid) {
      return;
    }

    this.progress.adding = true;
    this.cd.detectChanges();

    const request = toInstance(this.form.getRawValue(), ProjectComment);
    this.http
      .post(`projects/${this.project._id}/comments`, toPlain(request))
      .pipe(
        delay(UI_DELAY),
        map((obj) => toInstance(obj as object, ProjectComment)),
        finalize(() => {
          this.progress.adding = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (comment) => {
          this.messageControl.setValue(null);
          this.comments.unshift(comment);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  remove(index: number, { _id }: ProjectComment) {
    this.progress.removing[index] = true;
    this.cd.detectChanges();

    this.http
      .delete(`projects/${this.project._id}/comments/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.removing[index] = false;
          this.references?.popover?.hide();
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.comments.splice(index, 1);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
