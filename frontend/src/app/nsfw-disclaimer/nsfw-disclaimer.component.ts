import {
  Component,
  EventEmitter,
  Inject,
  Output,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";

@Component({
  selector: "app-nsfw-disclaimer",
  templateUrl: "./nsfw-disclaimer.component.html",
  styleUrls: ["./nsfw-disclaimer.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NsfwDisclaimer {
  languages = Languages;

  @Output()
  agree = new EventEmitter<void>();

  constructor(@Inject(CURRENT_LANGUAGE) public language: Languages) {}
}
