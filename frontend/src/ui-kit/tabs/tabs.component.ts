import {
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  TemplateRef,
  ChangeDetectionStrategy,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

@Component({
  selector: "app-tabs",
  templateUrl: "./tabs.component.html",
  styleUrls: ["./tabs.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class TabsComponent {
  @Input()
  @HostBinding("attr.data-style")
  style: "default" | "compact" = "default";

  @Input()
  active: number = 0;

  @Input()
  tabs: {
    title?: string;
    link?: [];
    content: TemplateRef<any>;
    titleTemplate?: TemplateRef<any>;
    selector?: string;
    hidden: boolean;
  }[] = [];

  @Output()
  activated = new EventEmitter();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  activate(index: number) {
    const tab = this.tabs[index];
    if (!!tab.link) {
      this.router.navigate(tab.link, { relativeTo: this.route });
    } else {
      this.active = index;
      this.activated.emit(index);
    }
  }
}
