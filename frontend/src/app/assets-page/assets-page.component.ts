import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { AssetsFilter } from "src/models/assets";

@Component({
  selector: "app-assets-page",
  templateUrl: "./assets-page.component.html",
  styleUrls: ["./assets-page.component.scss"],
})
export class AssetsPageComponent implements OnInit {
  filter!: AssetsFilter;

  constructor(
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.data.subscribe(async ({ filter }) => {
      this.filter = filter;
      this.cd.detectChanges();
    });
  }
}
