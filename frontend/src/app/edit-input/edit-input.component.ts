import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  forwardRef,
  Input,
  OnInit,
  ViewChild,
} from "@angular/core";
import {
  ControlValueAccessor,
  FormBuilder,
  FormGroup,
  NG_VALUE_ACCESSOR,
} from "@angular/forms";
import { plainToInstance } from "class-transformer";
import { delay, finalize, map } from "rxjs";
import { Artefact } from "src/models/artefacts";
import { HttpService } from "src/services/http.service";
import { Primitive } from "src/types/primitive";
import { UI_DELAY } from "src/ui-kit/consts";
import { ModalService } from "../../ui-kit/modal/modal.service";

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
})
export class EditInputComponent implements OnInit, ControlValueAccessor {
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

  @Input()
  type!: string;

  @Input()
  enum: Primitive[] = [];

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

  @Input()
  inputs: FormGroup;

  @ViewChild("inputRef")
  set inputRef(inputRef: ElementRef<HTMLElement>) {
    if (!!inputRef) {
      setTimeout(() => inputRef.nativeElement.focus(), 1);
    }
  }

  valueControl = this.fb.control<boolean | number | string | string[] | null>(
    null
  );
  form = this.fb.group({
    value: this.valueControl,
  });

  constructor(
    private fb: FormBuilder,
    private http: HttpService,
    private modal: ModalService,
    public cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.valueControl.valueChanges.subscribe((value) => {
      this.onChange(
        (() => {
          switch (this.type) {
            case "boolean":
              return !!value;
            case "string[]":
              const values = value as string[];
              if (values.length <= 0) {
                return null;
              }
              return values.join("|");
            default:
              return value;
          }
        })()
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
            if (!value) {
              return null;
            }
            return (value as string).split("|");
          default:
            return value;
        }
      })(),
      { emitEvent: false }
    );
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

  setDisabledState?(isDisabled: boolean): void {
    // Handle disabling component
  }

  putUrl(url: string) {
    this.valueControl.setValue(url);
    this.cd.detectChanges();

    this.modal.close();
  }

  async paste(event: ClipboardEvent) {
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
          type.startsWith("image/")
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

    let formData = new FormData();
    formData.append("file", file);

    this.http
      .post("artefacts", formData)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.uploading = false;
          this.cd.detectChanges();
        }),
        map((json) => plainToInstance(Artefact, json as Object))
      )
      .subscribe({
        next: ({ url }) => {
          this.valueControl.setValue(url);
          this.cd.detectChanges();

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
    if (!!data) {
      this.valueControl.setValue(data);
      return;
    }

    const file = event.dataTransfer.files[0];
    if (!!file && file.type.startsWith("image/")) {
      this.upload(file);
    }
  }
}
