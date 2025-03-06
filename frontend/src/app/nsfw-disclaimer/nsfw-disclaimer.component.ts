import { Component, EventEmitter, Output } from "@angular/core";

@Component({
  selector: "app-nsfw-disclaimer",
  templateUrl: "./nsfw-disclaimer.component.html",
  styleUrls: ["./nsfw-disclaimer.component.scss"],
})
export class NsfwDisclaimer {
  @Output()
  ok = new EventEmitter<void>();
}
