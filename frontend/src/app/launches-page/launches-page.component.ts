import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { LaunchesFilter } from "src/models/launch";

@Component({
  selector: "app-launches-page",
  templateUrl: "./launches-page.component.html",
  styleUrls: ["./launches-page.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class LaunchesPageComponent {
  filter!: LaunchesFilter;

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.data.subscribe(({ filter }) => (this.filter = filter));
  }
}
