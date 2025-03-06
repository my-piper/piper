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
  @Input()
  image: string;

  @Input()
  mask: string;

  @Input()
  inputsForm: FormGroup;

  @Output()
  changed = new EventEmitter();

  constructor(
    private modal: ModalService,
    private cd: ChangeDetectorRef
  ) {}

  save(mask: string) {
    this.inputsForm.patchValue({ [this.mask]: mask });
    this.modal.close();
    this.changed.emit();
  }
}
