import { Component, EventEmitter, Inject, Output } from "@angular/core";
import { Languages } from "src/ui-kit/enums/languages";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";

@Component({
  selector: "app-nsfw-disclaimer",
  templateUrl: "./nsfw-disclaimer.component.html",
  styleUrls: ["./nsfw-disclaimer.component.scss"],
})
export class NsfwDisclaimer {
  languages = Languages;

  @Output()
  agree = new EventEmitter<void>();

  constructor(@Inject(CURRENT_LANGUAGE) public language: Languages) {}
}
