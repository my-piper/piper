import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { FormGroup } from "@angular/forms";
import { ModalService } from "../../ui-kit/modal/modal.service";

@Component({
  selector: "app-draw-mask",
  templateUrl: "./draw-mask.component.html",
  styleUrls: ["./draw-mask.component.scss"],
})
export class DrawMaskComponent {
  i18n = {
    drawMask: $localize`:@@label.draw_mask:Draw mask`,
  };

  @Input()
  image: string;

  @Input()
  mask: string;

  @Input()
  type: "grayscale" | "transparent" = "grayscale";

  @Input()
  inputs: FormGroup;

  @Output()
  changed = new EventEmitter();

  constructor(
    private modal: ModalService,
    private cd: ChangeDetectorRef
  ) {}

  save(mask: string) {
    this.inputs.patchValue({ [this.mask]: mask });
    this.modal.close();
    this.changed.emit();
  }
}
