import { Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { LaunchesFilter } from "src/models/launch";
import { LaunchOutputsComponent } from "../launch-outputs/launch-outputs.component";

@Component({
  selector: "app-launches-page",
  templateUrl: "./launches-page.component.html",
  styleUrls: ["./launches-page.component.scss"],
})
export class LaunchesPageComponent {
  modal!: LaunchOutputsComponent;

  filter!: LaunchesFilter;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.data.subscribe(async ({ filter }) => (this.filter = filter));
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }
}
