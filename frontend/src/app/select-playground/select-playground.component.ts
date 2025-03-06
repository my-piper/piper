import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
} from "@angular/core";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { Project } from "src/models/project";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";

@Component({
  selector: "app-select-playground",
  templateUrl: "./select-playground.component.html",
  styleUrls: ["./select-playground.component.scss"],
})
export class SelectPlaygroundComponent {
  error!: Error;
  progress = { loading: false };

  projects: Project[] = [];

  @Output()
  selected = new EventEmitter<Project>();

  constructor(
    private http: HttpService,
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
}
