import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { FormControl } from "@angular/forms";
import { finalize, map } from "rxjs";
import { DisplayError } from "src/models/errors";
import { DeployNode } from "src/models/deploy-node";
import { Node, NodeDeploy, NodesFilter } from "src/models/node";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { HttpService } from "src/services/http.service";
import { mapTo, toInstance, toPlain } from "src/utils/models";
import { groupNodes } from "src/utils/node-groups";
import { deployItem, isDeployNode, matchDeploys } from "src/utils/deploy-node";
import { rankNodes, recentNodes, rememberNode } from "src/utils/node-search";

const BEST_MATCH_LIMIT = 50;

type Section = { id: string; title: string; nodes: Node[]; offset: number };

/** What was picked: a catalog node by id, or a Deploy to run as a node. */
export type NodePick = { node: string } | { deploy: NodeDeploy };

/**
 * The node search popover of the canvas (double-click, or a wire dropped on
 * empty canvas): ranked search over the catalog, recent nodes and categories,
 * driven from the keyboard.
 */
@Component({
  selector: "app-node-search",
  templateUrl: "./node-search.component.html",
  styleUrls: ["./node-search.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NodeSearchComponent implements OnInit, AfterViewInit {
  private readonly http = inject(HttpService);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly language = inject(CURRENT_LANGUAGE);

  /** Input types of the dropped wire: only nodes that accept one of them. */
  @Input()
  accepts: string[] | null = null;

  /** A node was chosen; `keepOpen` when it was added with Shift + Enter. */
  @Output()
  picked = new EventEmitter<{ pick: NodePick; keepOpen: boolean }>();

  @Output()
  closed = new EventEmitter<void>();

  @ViewChild("field")
  field!: ElementRef<HTMLInputElement>;

  query = new FormControl("", { nonNullable: true });

  loading = false;
  error: DisplayError | null = null;
  catalog: Node[] = [];
  /** The user's own Deploys, offered when no wire was dropped. */
  deploys: Node[] = [];
  sections: Section[] = [];
  /** All listed nodes in display order; `active` indexes into it. */
  items: Node[] = [];
  active = 0;

  ngOnInit() {
    this.load();
    this.query.valueChanges.subscribe(() => {
      this.build();
      this.cd.detectChanges();
    });
  }

  ngAfterViewInit() {
    this.field.nativeElement.focus();
  }

  private load() {
    this.loading = true;
    const filter = this.accepts?.length
      ? { accepts: this.accepts.join(",") }
      : {};
    this.http
      .get("nodes", toPlain(mapTo(filter, NodesFilter)))
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cd.detectChanges();
        }),
        map((arr) => (arr as object[]).map((e) => toInstance(e, Node))),
      )
      .subscribe({
        next: (nodes) => {
          this.catalog = nodes;
          this.build();
        },
        error: (err) => (this.error = err),
      });

    if (!this.accepts?.length) {
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
            this.build();
            this.cd.detectChanges();
          },
          // the catalog stays usable without them
          error: () => (this.deploys = []),
        });
    }
  }

  private deploySection(query: string): Omit<Section, "offset"> {
    return {
      id: "deploys",
      title: $localize`:@@label.deploys:Deploys`,
      nodes: matchDeploys(this.deploys, query),
    };
  }

  private build() {
    const query = this.query.value.trim();
    const sections: Omit<Section, "offset">[] = [];
    if (query) {
      sections.push({
        id: "best",
        title: $localize`:@@label.best_match:Best match`,
        nodes: rankNodes(this.catalog, query, this.language).slice(
          0,
          BEST_MATCH_LIMIT,
        ),
      });
    } else {
      const byId = new Map(this.catalog.map((n) => [n._id, n]));
      const recent = recentNodes()
        .map((id) => byId.get(id))
        .filter(Boolean);
      if (recent.length > 0) {
        sections.push({
          id: "recent",
          title: $localize`:@@label.recent:Recent`,
          nodes: recent,
        });
      }
      sections.push(...groupNodes(this.catalog));
    }
    // a dropped wire needs inputs of its type, which the list doesn't carry
    if (!this.accepts?.length) {
      sections.push(this.deploySection(query));
    }
    let offset = 0;
    this.sections = sections
      .filter(({ nodes }) => nodes.length > 0)
      .map((s) => {
        const section = { ...s, offset };
        offset += s.nodes.length;
        return section;
      });
    this.items = this.sections.flatMap(({ nodes }) => nodes);
    this.active = 0;
  }

  key(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (this.items.length > 0) {
          const step = event.key === "ArrowDown" ? 1 : -1;
          this.active =
            (this.active + step + this.items.length) % this.items.length;
          this.cd.detectChanges();
          this.host.nativeElement
            .querySelector(".item.active")
            ?.scrollIntoView({ block: "nearest" });
        }
        break;
      }
      case "Enter": {
        event.preventDefault();
        const node = this.items[this.active];
        if (node) {
          this.pick(node, event.shiftKey);
        }
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        this.closed.emit();
        break;
    }
  }

  pick(node: Node, keepOpen: boolean) {
    if (isDeployNode(node)) {
      this.picked.emit({ pick: { deploy: node.deploy }, keepOpen });
    } else {
      rememberNode(node._id);
      this.picked.emit({ pick: { node: node._id }, keepOpen });
    }
    if (keepOpen) {
      this.field.nativeElement.focus();
    }
  }

  @HostListener("document:mousedown", ["$event"])
  outside(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target as globalThis.Node)) {
      this.closed.emit();
    }
  }
}
