import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { LaunchesFilter } from "src/models/launch";
import { LaunchOutputsComponent } from "../launch-outputs/launch-outputs.component";

@Component({
  selector: "app-launches-page",
  templateUrl: "./launches-page.component.html",
  styleUrls: ["./launches-page.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class LaunchesPageComponent {
  modal!: LaunchOutputsComponent;

  filter!: LaunchesFilter;
  /** Lists set `data.launchesView: "table"`; the playground keeps cards. */
  view: "cards" | "table" = "cards";

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.route.data.subscribe(({ filter, launchesView }) => {
      this.filter = filter;
      this.view = launchesView ?? "cards";
    });
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }
}
