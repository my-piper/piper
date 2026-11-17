import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { Socket } from "ngx-socket-io";
import { delay, finalize, map } from "rxjs";
import {
  PipelineMessage,
  PipelineMessagesFilter,
} from "src/models/pipeline-message";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";

@Component({
  selector: "app-pipeline-messages",
  templateUrl: "./pipeline-messages.component.html",
  styleUrls: ["./pipeline-messages.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class PipelineMessagesComponent implements OnInit {
  progress = { loading: false };
  error: Error;

  messages: PipelineMessage[] = [];
  filter!: PipelineMessagesFilter;

  constructor(
    private socket: Socket,
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe(async ({ filter }) => {
      this.filter = filter;
      await this.load();
    });
  }

  listen() {
    this.socket
      .fromEvent<object>("pipeline_message")
      .subscribe(() => this.load());
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("pipeline-messages", toPlain(this.filter))
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) =>
          (arr as object[]).map((e) =>
            plainToInstance(PipelineMessage, e as object),
          ),
        ),
      )
      .subscribe({
        next: (messages) => {
          this.messages = messages;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err.error),
      });
  }
}
