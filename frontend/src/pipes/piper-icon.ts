import { Pipe, PipeTransform } from "@angular/core";
import { PIPER_ICONS } from "src/icons";

/**
 * An icon name from pipeline data, kept only if it is in the Piper icon set.
 * Taiga takes a name containing "/" as a URL and loads it as a CSS mask, so
 * an unchecked name would let a pipeline make every viewer fetch any URL.
 * Unknown names draw nothing, as with app-icon.
 */
@Pipe({
  name: "piperIcon",
  standalone: false,
})
export class PiperIconPipe implements PipeTransform {
  transform(name: string | null | undefined): string | null {
    return name && Object.hasOwn(PIPER_ICONS, name) ? name : null;
  }
}
