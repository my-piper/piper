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
import { DeployNode } from "src/models/deploy-node";
import { Node, NodesFilter } from "src/models/node";
import { UserRole } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { mapTo, toInstance, toPlain } from "src/utils/models";
import { deployItem, matchDeploys } from "src/utils/deploy-node";
import { groupNodes, NodeGroup } from "src/utils/node-groups";

const DEPLOYS_GROUP = "deploys";

@Component({
  selector: "app-select-node",
  templateUrl: "./select-node.component.html",
  styleUrls: ["./select-node.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SelectNodeComponent implements OnInit, AfterViewInit {
  userRole = UserRole;
  languages = Languages;

  progress: { loading: boolean } = { loading: false };
  error: DisplayError;

  groups: NodeGroup[] = [];
  /** The user's own Deploys, listed as a group after the catalog. */
  deploys: Node[] = [];
  /** Chip appearance of the catalog tags that mark a node's price. */
  tagAppearances: Record<string, string> = {
    free: "positive",
    cheap: "warning",
  };
  /** Ids of the groups the user has open; every group opens while searching. */
  openGroups = new Set<string>();

  searchControl = this.fb.control<string>(null);
  form = this.fb.group({
    search: this.searchControl,
  });

  @ViewChild("searchInput")
  searchInput!: ElementRef<HTMLInputElement>;

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.load();
    this.loadDeploys();

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
          this.groups = [...groupNodes(nodes), this.deployGroup(search)].filter(
            ({ nodes }) => nodes.length > 0,
          );
          this.openGroups =
            search || this.groups.length === 1
              ? new Set(this.groups.map(({ id }) => id))
              : new Set();
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  private loadDeploys() {
    this.http
      .get("me/deploys")
      .pipe(
        map((arr) =>
          (arr as object[])
            .map((e) => toInstance(e, DeployNode))
            .map((d) => deployItem(d, d.title)),
        ),
      )
      .subscribe({
        next: (deploys) => {
          this.deploys = deploys;
          const { search } = this.form.getRawValue();
          this.groups = [
            ...this.groups.filter(({ id }) => id !== DEPLOYS_GROUP),
            this.deployGroup(search),
          ].filter(({ nodes }) => nodes.length > 0);
          this.cd.detectChanges();
        },
        // the catalog stays usable without them
        error: () => (this.deploys = []),
      });
  }

  private deployGroup(search: string): NodeGroup {
    return {
      id: DEPLOYS_GROUP,
      title: $localize`:@@label.deploys:Deploys`,
      nodes: matchDeploys(this.deploys, search),
    };
  }

  /** What dragging a palette item drops on the canvas. */
  dragPayload(node: Node) {
    return node.deploy ? { deploy: node.deploy } : { node: node._id };
  }

  setOpen(group: string, open: boolean) {
    const groups = new Set(this.openGroups);
    if (open) {
      groups.add(group);
    } else {
      groups.delete(group);
    }
    this.openGroups = groups;
    this.cd.detectChanges();
  }
}
