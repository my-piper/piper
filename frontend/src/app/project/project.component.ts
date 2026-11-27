import {
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import assign from "lodash/assign";
import { debounceTime } from "rxjs";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { AppConfig } from "src/models/app-config";
import { DisplayError } from "src/models/errors";
import { Pipeline } from "src/models/pipeline";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { ProjectManager } from "src/services/project.manager";
import { TopbarService } from "src/services/topbar.service";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { getLabel } from "src/utils/i18n";

@Component({
  selector: "app-project",
  templateUrl: "./project.component.html",
  styleUrls: ["./project.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ProjectComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly topbar = inject(TopbarService);

  /** Breadcrumbs, section tabs and save status, shown in the app top bar. */
  @ViewChild("topbar", { static: true })
  topbarRef!: TemplateRef<unknown>;

  userRole = UserRole;
  /** Whether the project settings dialog is open. */
  settingsOpen = false;
  editPipelineVisualComponent = EditPipelineVisualComponent;

  progress = { launching: false };
  error: DisplayError;

  pipeline!: Pipeline;
  project!: Project;

  child!: unknown;
  /** Index of the active section tab; Canvas is the first. */
  activeTab = 0;

  readonly saveStatuses = {
    dirty: {
      label: $localize`:@@message.project_unsaved_changes:Unsaved changes`,
      icon: "@tui.cloud",
      appearance: "warning",
    },
    saving: {
      label: $localize`:@@message.project_saving:Saving…`,
      icon: "@tui.cloud-upload",
      appearance: "neutral",
    },
    saved: {
      label: $localize`:@@message.project_saved:Saved`,
      icon: "@tui.cloud-check",
      appearance: "positive",
    },
    error: {
      label: $localize`:@@message.project_save_failed:Save failed`,
      icon: "@tui.cloud-alert",
      appearance: "negative",
    },
  };

  form = this.fb.group({
    name: this.fb.control<string>(null, [Validators.required]),
  });

  constructor(
    @Inject(CURRENT_LANGUAGE) public language: Languages,
    public projectManager: ProjectManager,
    public config: AppConfig,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.topbar.set(this.topbarRef);
    this.route.data.subscribe(({ project }) => {
      [this.project, this.pipeline] = [project, project.pipeline];
      this.build();
    });

    this.projectManager.error
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => (this.error = error));

    this.projectManager.updates
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cd.detectChanges());

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef), debounceTime(300))
      .subscribe(({ name }) => {
        if (
          this.form.valid &&
          name !== getLabel(this.pipeline.name, this.language)
        ) {
          assign(this.pipeline, { name });
          this.projectManager.markDirty();
        }
      });
  }

  ngOnDestroy() {
    this.topbar.clear(this.topbarRef);
  }

  build() {
    const { name } = this.pipeline;
    this.form.patchValue({ name: getLabel(name, this.language) });
  }

  updated(project: Project) {
    assign(this.project, project);
  }

  settingsUpdated(project: Project) {
    this.updated(project);
    this.settingsOpen = false;
  }

  /**
   * The canvas owns no route of its own beyond the project root (drawers add
   * outlets to it), so its tab is selected from the routed child instead of
   * RouterLinkActive.
   */
  activate(child: unknown) {
    this.child = child;
    if (child instanceof EditPipelineVisualComponent) {
      this.activeTab = 0;
    }
  }
}
