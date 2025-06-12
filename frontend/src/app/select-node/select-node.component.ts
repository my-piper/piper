import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from "@angular/core";
import { delay, finalize, map } from "rxjs";
import { Node } from "src/models/node";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { toInstance } from "src/utils/models";

@Component({
  selector: "app-select-node",
  templateUrl: "./select-node.component.html",
  styleUrls: ["./select-node.component.scss"],
})
export class SelectNodeComponent implements OnInit {
  userRole = UserRole;

  progress: { loading: boolean; selecting: { [key: string]: boolean } } = {
    loading: false,
    selecting: {},
  };
  error: Error;

  nodes: Node[] = [];
  references: { popover: PopoverComponent } = { popover: null };

  @Output()
  selected = new EventEmitter<Node>();

  constructor(
    private http: HttpService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.load();
  }

  private load() {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("nodes")
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as Object[]).map((e) => toInstance(e, Node)))
      )
      .subscribe({
        next: (nodes) => {
          this.nodes = nodes;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  select({ _id }: Node) {
    this.progress.selecting[_id] = true;
    this.cd.detectChanges();

    this.http
      .get(`nodes/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.selecting[_id] = false;
          this.cd.detectChanges();
        }),
        map((obj) => toInstance(obj as object, Node))
      )
      .subscribe({
        next: (node) => this.selected.emit(node),
        error: (err) => (this.error = err),
      });
  }

  remove(node: Node) {
    const { _id } = node;
    this.http.delete(`nodes/${_id}`).subscribe({
      next: () => {
        this.references.popover?.hide();
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
}
