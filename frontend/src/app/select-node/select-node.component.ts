import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { debounceTime, delay, finalize, map } from "rxjs";
import { DisplayError } from "src/models/errors";
import { Node, NodesFilter, SCRIPT_NODE_ID } from "src/models/node";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { mapTo, toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-select-node",
  templateUrl: "./select-node.component.html",
  styleUrls: ["./select-node.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SelectNodeComponent implements OnInit, AfterViewInit {
  userRole = UserRole;
  scriptNodeId = SCRIPT_NODE_ID;
  languages = Languages;

  progress: { loading: boolean; removing: boolean } = {
    removing: false,
    loading: false,
  };
  error: DisplayError;

  nodes: Node[] = [];
  actionsOpen: string | null = null;

  searchControl = this.fb.control<string>(null);
  form = this.fb.group({
    search: this.searchControl,
  });

  @ViewChild("searchInput")
  searchInput!: ElementRef<HTMLInputElement>;

  state: { currentGroup?: string } = {};

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.load();

    this.searchControl.valueChanges
      .pipe(debounceTime(500))
      .subscribe(() => this.load());
  }

  ngAfterViewInit() {
    this.searchInput.nativeElement.focus();
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    const { search } = this.form.getRawValue();

    this.http
      .get(
        "nodes",
        toPlain(
          mapTo(
            {
              ...(search ? { search } : {}),
            },
            NodesFilter,
          ),
        ),
      )
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as object[]).map((e) => toInstance(e, Node))),
      )
      .subscribe({
        next: (nodes) => {
          this.nodes = nodes;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  remove(node: Node) {
    const { _id } = node;
    this.progress.removing = true;
    this.cd.detectChanges();

    this.http
      .delete(`nodes/${_id}`)
      .pipe(
        finalize(() => {
          this.progress.removing = false;
          this.actionsOpen = null;
          this.cd.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          const index = this.nodes.indexOf(node);
          if (index !== -1) {
            this.nodes.splice(index, 1);
            this.nodes = [...this.nodes];
            this.cd.detectChanges();
          }
        },
        error: (err) => (this.error = err),
      });
  }

  toggle(group: string) {
    this.state.currentGroup = this.state.currentGroup === group ? null : group;
    this.cd.detectChanges();
  }
}
