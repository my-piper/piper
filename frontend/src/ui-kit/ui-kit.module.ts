import { CommonModule } from "@angular/common";
import { TuiButton, TuiIcon } from "@taiga-ui/core";
import { TuiBadge } from "@taiga-ui/kit";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { IncludesPipe } from "src/pipes/includes.pipe";
import { HotKeyDirective } from "src/directives/hot-key.directive";
import { ModalComponent } from "./modal/modal.component";
import { ModalDirective } from "./modal/modal.directive";
import { FileTypePipe } from "src/pipes/file-type.pipe";
import { I18nPipe, LabelsPipe } from "src/pipes/i18n.pipe";
import { LengthPipe } from "src/pipes/length.pipe";
import { MockArrayPipe } from "src/pipes/mock-array.pipe";
import { TickerPipe } from "src/pipes/ticker.pipe";
import { TimeDiffPipe } from "src/pipes/time-diff.pipe";
import { TimePassedPipe } from "src/pipes/time-passed.pipe";
import { PopoverComponent } from "./popover/popover.component";
import { PopoverDirective } from "./popover/popover.directive";

@NgModule({
  declarations: [
    ModalComponent,
    ModalDirective,
    PopoverComponent,
    PopoverDirective,
    TimePassedPipe,
    I18nPipe,
    IncludesPipe,
    HotKeyDirective,
    FileTypePipe,
    LengthPipe,
    MockArrayPipe,
    LabelsPipe,
    TimeDiffPipe,
    TickerPipe,
  ],
  exports: [
    ModalComponent,
    ModalDirective,
    PopoverComponent,
    PopoverDirective,
    TimePassedPipe,
    I18nPipe,
    IncludesPipe,
    HotKeyDirective,
    FileTypePipe,
    LengthPipe,
    MockArrayPipe,
    LabelsPipe,
    TimeDiffPipe,
    TickerPipe,
  ],
  // TuiButton: the modal's close button (#153); TuiBadge: its ESC hint
  // (#155); TuiIcon: its close icon (#182).
  imports: [CommonModule, ReactiveFormsModule, TuiButton, TuiBadge, TuiIcon],
})
export class UiKitModule {}
