import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { debounceTime, delay, finalize, map } from "rxjs";
import { Node, NodesFilter } from "src/models/node";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { mapTo, toInstance, toPlain } from "src/utils/models";

@Component({
  selector: "app-select-node",
  templateUrl: "./select-node.component.html",
  styleUrls: ["./select-node.component.scss"],
})
export class SelectNodeComponent implements OnInit, AfterViewInit {
  userRole = UserRole;

  progress: { loading: boolean } = {
    loading: false,
  };
  error: Error;

  nodes: Node[] = [];
  references: { popover: PopoverComponent } = { popover: null };

  searchControl = this.fb.control<string>(null);
  form = this.fb.group({
    search: this.searchControl,
  });

  @ViewChild("searchInput")
  searchInput!: ElementRef<HTMLInputElement>;

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef
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
              ...(!!search ? { search } : {}),
            },
            NodesFilter
          )
        )
      )
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
