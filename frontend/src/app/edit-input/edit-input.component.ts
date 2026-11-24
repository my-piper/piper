import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  forwardRef,
  HostBinding,
  Inject,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import {
  ControlValueAccessor,
  FormBuilder,
  FormControl,
  FormGroup,
  NG_VALUE_ACCESSOR,
} from "@angular/forms";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { Artefact } from "src/models/artefacts";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/consts/ui";
import { Languages } from "src/enums/languages";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
import { getLabel } from "src/utils/i18n";
import { ChoiceGroup, choiceGroups } from "src/utils/input-choices";
import { TuiNumberFormatSettings } from "@taiga-ui/core";
import { ModalService } from "../../ui-kit/modal/modal.service";

const COMPACT_LENGTH = 3;

// The ends of a native <input type="range"> without min or max.
const RANGE_MIN = 0;
const RANGE_MAX = 100;

const INTEGER_FORMAT: Partial<TuiNumberFormatSettings> = { precision: 0 };
// Show only the decimals a value has: 0.5, not 0.50.
const FLOAT_FORMAT: Partial<TuiNumberFormatSettings> = {
  decimalMode: "not-zero",
};

@Component({
  selector: "app-edit-input",
  templateUrl: "./edit-input.component.html",
  styleUrls: ["./edit-input.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EditInputComponent),
      multi: true,
    },
  ],
  standalone: false,
})
export class EditInputComponent
  implements OnInit, OnChanges, ControlValueAccessor
{
  i18n = {
    generated: $localize`:@@label.generated:Generated`,
    assets: $localize`:@@label.assets:Assets`,
    selectImage: $localize`:@@label.select_image:Select image`,
  };

  error!: Error;
  progress: { uploading: boolean } = { uploading: false };

  state = { dragging: false };

  @Input()
  id!: string;

  /** The input's title, used as the accessible name of its control. */
  @Input()
  label: string;

  @HostBinding("attr.data-type")
  @Input()
  type!: string;

  @HostBinding("class.compact")
  @Input()
  get compact() {
    if (this.type === "image[]") {
      const value = this.valueControl.value as string[];
      return value.length > COMPACT_LENGTH;
    }
    return false;
  }

  @HostBinding("class.empty")
  @Input()
  get empty() {
    if (this.type === "image[]") {
      const value = this.valueControl.value as string[];
      return value.length <= 0;
    }
    return false;
  }

  @Input()
  enum: Primitive[] = [];

  /**
   * Enum options, grouped. They are rendered only for string and string[]
   * inputs, whose values are strings.
   */
  choices: ChoiceGroup[] = [];
  /** Option values of each group, in the order of `choices`. */
  groupValues: string[][] = [];
  /**
   * One control per group of a string[] input. Each holds every selected
   * value: a filter toggles only its own items and keeps the rest, while
   * filters sharing one control would miss each other's changes.
   */
  groupControls: FormControl<string[]>[] = [];
  /** Option values for a native select: flat, or one list per group. */
  selectItems: string[] | string[][] = [];
  selectLabels: string[] = [];
  private choiceLabels = new Map<string, string>();

  /** Shows an option value by its label. */
  readonly labelOf = (value: string) => this.choiceLabels.get(value) ?? value;
  readonly choiceContent = ({ $implicit }: { $implicit: string }) =>
    this.labelOf($implicit);

  @Input()
  freeform: boolean;

  @Input()
  multiline: boolean;

  @Input()
  default: Primitive;

  @Input()
  placeholder: string;

  @Input()
  min: number;

  @Input()
  max: number;

  @Input()
  step: number;

  get numberFormat() {
    return this.type === "integer" ? INTEGER_FORMAT : FLOAT_FORMAT;
  }

  /** A step makes a slider; a missing end falls back to a native range's. */
  get slider() {
    return !!this.step;
  }

  get sliderMin() {
    return this.min ?? RANGE_MIN;
  }

  get sliderMax() {
    return this.max ?? RANGE_MAX;
  }

  readonly minSafe = Number.MIN_SAFE_INTEGER;
  readonly maxSafe = Number.MAX_SAFE_INTEGER;

  @Input()
  inputs: FormGroup;

  @HostBinding("class.disabled")
  @Input()
  disabled: boolean = false;

  @ViewChild("inputRef")
  set inputRef(inputRef: ElementRef<HTMLElement>) {
    if (inputRef) {
      setTimeout(() => inputRef.nativeElement.focus(), 1);
    }
  }

  valueControl = this.fb.control<boolean | number | string | string[] | null>(
    null,
  );
  form = this.fb.group({
    value: this.valueControl,
  });

  constructor(
    @Inject(CURRENT_LANGUAGE) private language: Languages,
    private fb: FormBuilder,
    private http: HttpService,
    private modal: ModalService,
    public cd: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes["enum"]) {
      this.choices = choiceGroups(this.enum as string[], (label) =>
        getLabel(label, this.language),
      );
      this.choiceLabels = new Map(
        this.choices.flatMap(({ choices }) =>
          choices.map(({ value, label }) => [value, label]),
        ),
      );
      const values = this.choices.map(({ choices }) =>
        choices.map(({ value }) => value),
      );
      this.groupValues = values;
      this.groupControls = values.map(() => {
        const control = this.fb.nonNullable.control<string[]>([]);
        control.valueChanges.subscribe((selected) =>
          this.valueControl.setValue(selected),
        );
        return control;
      });
      this.syncGroups();
      const grouped = this.choices.some(({ name }) => !!name);
      this.selectItems = grouped ? values : values.flat();
      this.selectLabels = grouped
        ? this.choices.map(({ name }) => name ?? "")
        : [];
    }
  }

  /** Shows the selected values in every group's filter. */
  private syncGroups() {
    const value = this.valueControl.value;
    const selected = Array.isArray(value) ? value : [];
    for (const control of this.groupControls) {
      control.setValue(selected, { emitEvent: false });
    }
  }

  ngOnInit() {
    this.valueControl.valueChanges.subscribe((value) => {
      this.syncGroups();
      this.onChange(
        (() => {
          switch (this.type) {
            case "boolean":
              return !!value;
            case "string[]":
            case "image[]": {
              const values = (value as string[]) || [];
              if (values.length <= 0) {
                return null;
              }
              return values.join("|");
            }
            default:
              return value;
          }
        })(),
      );
      this.cd.detectChanges();
    });
  }

  writeValue(value: Primitive): void {
    this.valueControl.setValue(
      (() => {
        switch (this.type) {
          case "boolean":
            return !!value;
          case "string[]":
          case "image[]":
            return value ? (value as string).split("|") : [];
          default:
            return value;
        }
      })(),
      { emitEvent: false },
    );
    this.syncGroups();
    this.cd.detectChanges();
  }

  onChange: any = () => {};
  onTouch: any = () => {};

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouch = fn;
  }

  setDisabledState?(disabled: boolean): void {
    this.disabled = disabled;
  }

  putUrl(url: string) {
    this.setValue(url);
    this.modal.close();
  }

  setValue(value: Primitive) {
    switch (this.type) {
      case "string[]":
      case "image[]": {
        const items = this.valueControl.value as string[];
        this.valueControl.setValue([...items, value as string]);
        break;
      }
      default:
        this.valueControl.setValue(value);
    }

    this.cd.detectChanges();
  }

  removeItem(index: number) {
    const items = this.valueControl.value as string[];
    items.splice(index, 1);
    this.valueControl.setValue([...items]);
    this.cd.detectChanges();
  }

  async pasteFromClipboard(event: ClipboardEvent) {
    let clipboardItems: Array<ClipboardItem | File> = [];

    if (typeof navigator?.clipboard?.read === "function") {
      try {
        clipboardItems = await navigator.clipboard.read();
      } catch (error) {
        console.error("Failed to read from clipboard", error);
        return;
      }
    } else if (event.clipboardData?.files) {
      clipboardItems = Array.from(event.clipboardData.files);
    }

    for (const item of clipboardItems) {
      if (item instanceof File && item.type.startsWith("image/")) {
        const blob = item;
        this.upload(blob);
      } else if (item instanceof ClipboardItem) {
        const imageTypes = item.types.filter((type) =>
          type.startsWith("image/"),
        );
        for (const imageType of imageTypes) {
          const blob = await item.getType(imageType);
          this.upload(blob);
        }
      }
    }
  }

  upload(file: Blob) {
    this.progress.uploading = true;
    this.cd.detectChanges();

    const formData = new FormData();
    formData.append("file", file);

    this.http
      .post("artefacts", formData)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.uploading = false;
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(Artefact, json as object)),
      )
      .subscribe({
        next: ({ url }) => {
          this.setValue(url);
          this.modal.close();
        },
        error: (err) => (this.error = err),
      });
  }

  tryDragOver(event: DragEvent) {
    event.preventDefault();
    this.state.dragging = true;
    this.cd.detectChanges();
  }

  leaveDragZone(event: DragEvent) {
    event.preventDefault();
    this.state.dragging = false;
    this.cd.detectChanges();
  }

  dropped(event: DragEvent) {
    event.preventDefault();
    this.state.dragging = false;
    this.cd.detectChanges();

    const data = event.dataTransfer.getData("text/uri");
    if (data) {
      this.setValue(data);
      return;
    }

    const file = event.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      this.upload(file);
    }
  }
}
