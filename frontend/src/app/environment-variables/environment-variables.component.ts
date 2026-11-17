import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { FormArray } from "@angular/forms";
import { HIDDEN_STRING } from "src/consts/core";
import { VariableGroup, VariableMeta } from "src/utils/environment";

/**
 * Name / Type / Value table shared by the User and Project Environments.
 * The parent owns the form array, saving and the footer.
 */
@Component({
  selector: "app-environment-variables",
  templateUrl: "./environment-variables.component.html",
  styleUrls: ["./environment-variables.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EnvironmentVariablesComponent {
  @Input({ required: true }) variables!: FormArray<VariableGroup>;
  /** Rows can be removed (and added by the parent). */
  @Input() removable = false;
  @Input() removing: { [key: string]: boolean } = {};
  @Output() remove = new EventEmitter<number>();

  private texts = {
    stored: $localize`:@@label.stored:Stored`,
    storedPlaceholder: $localize`:@@message.stored_value_leave_empty:Stored, leave empty to keep`,
    storedSecretDropped: $localize`:@@message.stored_secret_dropped_on_save:The stored value is dropped on save`,
  };

  placeholder(
    { stored, storedSecret, readonly, inherited }: VariableMeta,
    type: string,
    secret: boolean,
  ) {
    if (inherited && inherited.source !== "none") {
      const { value } = inherited;
      return value === undefined || value === HIDDEN_STRING
        ? this.texts.stored
        : String(value);
    }
    if (storedSecret && !secret && !readonly && type === "string") {
      return this.texts.storedSecretDropped;
    }
    if (stored && !readonly && type === "string") {
      return this.texts.storedPlaceholder;
    }
    return "";
  }
}
