import { Component, ChangeDetectionStrategy } from "@angular/core";

@Component({
  selector: "app-feed-skeleton",
  templateUrl: "./feed-skeleton.component.html",
  styleUrls: ["./feed-skeleton.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class FeedSkeletonComponent {}
