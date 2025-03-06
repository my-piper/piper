import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from "@angular/core";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { BUILT_IN_NODES } from "src/consts/nodes";
import { Node } from "src/models/node";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";

@Component({
  selector: "app-add-node",
  templateUrl: "./add-node.component.html",
  styleUrls: ["./add-node.component.scss"],
})
export class AddNodeComponent implements OnInit {
  builtInNodes = BUILT_IN_NODES;
  progress = { loading: false };
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

  addNode() {}

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
        map((arr) => (arr as Object[]).map((e) => plainToInstance(Node, e)))
      )
      .subscribe({
        next: (nodes) => {
          this.nodes = nodes;
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err.error),
      });
  }

  select(node: Node) {
    this.selected.emit(node);
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
