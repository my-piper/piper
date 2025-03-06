import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Launch } from "src/models/launch";

@Component({
  selector: "app-launch-outputs-page",
  templateUrl: "./launch-outputs-page.component.html",
  styleUrls: ["./launch-outputs-page.component.scss"],
})
export class LaunchOutputsPageComponent {
  launch!: Launch;

  active!: { id: string; index: number };

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.data.subscribe(({ launch }) => (this.launch = launch));
    this.route.queryParams.subscribe(({ id, index }) =>
      !!id ? (this.active = { id, index }) : null
    );
  }
}
