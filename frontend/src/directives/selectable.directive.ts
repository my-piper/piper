import {
  Directive,
  EventEmitter,
  forwardRef,
  HostBinding,
  HostListener,
  Injectable,
  Input,
  OnInit,
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import assign from "lodash/assign";
import isEqual from "lodash/isEqual";

export enum SelectMode {
  single = "single",
  multiple = "multiple",
}

class Config {
  mode!: SelectMode;
  value!: any;
  enabled!: true;
  group!: string;

  constructor(defs: any = null) {
    if (!!defs) {
      assign(this, defs);
    }
  }
}

@Injectable({ providedIn: "root" })
export class SelectableHub {
  groups: { [key: string]: EventEmitter<any> } = {};

  bind(key: string): EventEmitter<any> {
    if (!this.groups[key]) {
      this.groups[key] = new EventEmitter<any>();
    }
    return this.groups[key];
  }

  emit(key: string, state: any) {
    this.bind(key).emit(state);
  }
}

const SELECTABLE_HUB = new SelectableHub();

export function eventEmitterFactory(): SelectableHub {
  return SELECTABLE_HUB;
}

@Directive({
  selector: "[appSelectable]",
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectableDirective),
      multi: true,
    },
  ],
})
export class SelectableDirective implements OnInit, ControlValueAccessor {
  config: Config = new Config({
    mode: SelectMode.single,
    enabled: true,
    group: "default",
  });

  @HostBinding("class.disabled")
  disabled = false;

  @HostBinding("class.selected")
  get selected() {
    const { value } = this.config;
    return this.state.findIndex((e) => isEqual(e, value)) !== -1;
  }

  @HostBinding("attr.data-mode")
  _mode: SelectMode = SelectMode.single;

  @Input("appSelectable")
  set configure(config: Partial<Config>) {
    assign(this.config, config);
  }

  state!: any[];

  onChange: (value: any) => void = () =>
    console.error("value accessor is not registered");
  onTouched: () => void = () =>
    console.error("value accessor is not registered");
  registerOnChange = (fn: () => void) => (this.onChange = fn);
  registerOnTouched = (fn: () => void) => (this.onTouched = fn);
  @HostListener("blur") onBlur = () => this.onTouched();

  constructor(private hub: SelectableHub) {}

  ngOnInit() {
    this.hub.bind(this.config.group).subscribe((state) => (this.state = state));
  }

  writeValue(value: any | any[]) {
    this.state = !!value ? (Array.isArray(value) ? value : [value]) : [];
  }

  setDisabledState(disabled: boolean) {
    this.disabled = disabled;
  }

  @HostListener("click")
  select() {
    const { mode, value, enabled } = this.config;
    if (!enabled) {
      return;
    }

    switch (mode) {
      case SelectMode.single:
        const current = this.state.length > 0 ? this.state[0] : null;
        if (!!current) {
          const same = isEqual(current, value);
          if (same) {
            return;
          }
          this.state = same ? [] : [value];
          this.onChange(same ? null : value);
        } else {
          this.state = [value];
          this.onChange(value);
        }
        break;
      case SelectMode.multiple:
        const index = this.state.findIndex((e) => isEqual(e, value));
        if (index !== -1) {
          this.state.splice(index, 1);
        } else {
          this.state.push(value);
        }
        this.onChange(this.state);
        break;
    }
    this.hub.emit(this.config.group, this.state);
  }
}
