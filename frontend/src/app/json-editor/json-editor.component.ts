import {
  Component,
  ElementRef,
  forwardRef,
  HostBinding,
  HostListener,
  Inject,
  Input,
  OnDestroy,
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { JSONEditor } from "@json-editor/json-editor";
import { isEqual } from "lodash";
import { Languages } from "src/ui-kit/enums/languages";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { getLabel } from "src/ui-kit/utils/i18n";

@Component({
  selector: "app-json-editor",
  templateUrl: "./json-editor.component.html",
  styleUrls: ["./json-editor.component.scss"],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => JsonEditorComponent),
      multi: true,
    },
  ],
})
export class JsonEditorComponent implements ControlValueAccessor, OnDestroy {
  private _value: object;
  private editor!: JSONEditor;

  @HostBinding("attr.data-disabled")
  disabled = false;

  @Input()
  features: ("collapse" | "required_only")[] = ["collapse", "required_only"];

  @Input()
  disable: string[] = [];

  @Input()
  schema: object;

  onChange: (value: any) => void = () =>
    console.error("value accessor is not registered");
  onTouched: () => void = () =>
    console.error("value accessor is not registered");

  registerOnChange = (fn: any) => (this.onChange = fn);
  registerOnTouched = (fn: any) => (this.onTouched = fn);

  @HostListener("blur")
  onBlur = () => this.onTouched();

  constructor(
    @Inject(CURRENT_LANGUAGE) private language: Languages,
    private hostRef: ElementRef
  ) {}

  writeValue(value: object) {
    if (!this.editor) {
      this.editor = new JSONEditor(this.hostRef.nativeElement, {
        display_required_only: this.features.includes("required_only"),
        //collapsed: true,
        disable_collapse: !this.features.includes("collapse"),
        disable_edit_json: true,
        disable_array_delete_all_rows: true,
        disable_array_delete_last_row: true,
        schema: this.schema,
        startval: value,
        template: {
          compile: (template: string) => () =>
            getLabel(template, this.language),
        },
      });
      this.editor.on("ready", () => {
        for (const path of this.disable) {
          this.editor.getEditor(path).disable();
        }
      });
      this.editor.on("add", ({ path }: { path: string }) => {
        // bug for JSON editor with collapsed: true
        this.editor.getEditor(path).enable();
      });
      this.editor.on("change", () => {
        const errors = this.editor.validate();
        if (errors.length > 0) {
          return;
        }

        const newValue = this.editor.getValue();
        if (isEqual(newValue, this._value)) {
          console.log("JSON value don't changed");
          return;
        }
        console.log("JSON value changed", newValue);
        this.onChange(newValue);
        this._value = value;
      });
      this.editor.theme.getDescription = (text: string) => {
        const el = document.createElement("div");
        el.innerHTML = text;
        return el;
      };
    } else {
      this.editor.setValue(value);
    }
    this._value = value;
  }

  setDisabledState(isDisabled: boolean) {
    this.disabled = isDisabled;
  }

  ngOnDestroy(): void {
    if (!!this.editor) {
      this.editor.destroy();
    }
  }
}
