import { CommonModule } from "@angular/common";
import { TuiButton } from "@taiga-ui/core";
import { TuiBadge } from "@taiga-ui/kit";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { IncludesPipe } from "src/pipes/includes.pipe";
import { HotKeyDirective } from "src/directives/hot-key.directive";
import { InViewportDirective } from "src/directives/in-viewport.directive";
import { LetDirective } from "src/directives/let.directive";
import { IconComponent } from "./icon/icon.component";
import { InformerComponent } from "./informer/informer.component";
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
import { SkeletonComponent } from "./skeleton/skeleton.component";
import { TabsComponent } from "./tabs/tabs.component";

@NgModule({
  declarations: [
    IconComponent,
    InformerComponent,
    ModalComponent,
    ModalDirective,
    PopoverComponent,
    PopoverDirective,
    TabsComponent,
    TimePassedPipe,
    I18nPipe,
    IncludesPipe,
    InViewportDirective,
    HotKeyDirective,
    FileTypePipe,
    LengthPipe,
    SkeletonComponent,
    MockArrayPipe,
    LabelsPipe,
    LetDirective,
    TimeDiffPipe,
    TickerPipe,
  ],
  exports: [
    IconComponent,
    InformerComponent,
    ModalComponent,
    ModalDirective,
    PopoverComponent,
    PopoverDirective,
    TabsComponent,
    TimePassedPipe,
    I18nPipe,
    IncludesPipe,
    InViewportDirective,
    HotKeyDirective,
    FileTypePipe,
    LengthPipe,
    SkeletonComponent,
    MockArrayPipe,
    LabelsPipe,
    LetDirective,
    TimeDiffPipe,
    TickerPipe,
  ],
  // TuiButton: the informer's OK and the modal's close button (#153);
  // TuiBadge: the modal's ESC hint (#155).
  imports: [CommonModule, ReactiveFormsModule, TuiButton, TuiBadge],
})
export class UiKitModule {}
