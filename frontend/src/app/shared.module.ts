import { NgModule } from "@angular/core";
import { IncludesPipe } from "src/pipes/includes.pipe";
import { HotKeyDirective } from "src/directives/hot-key.directive";
import { FileTypePipe } from "src/pipes/file-type.pipe";
import { I18nPipe, LabelsPipe } from "src/pipes/i18n.pipe";
import { LengthPipe } from "src/pipes/length.pipe";
import { MockArrayPipe } from "src/pipes/mock-array.pipe";
import { TickerPipe } from "src/pipes/ticker.pipe";
import { TimeDiffPipe } from "src/pipes/time-diff.pipe";
import { TimePassedPipe } from "src/pipes/time-passed.pipe";

/** Piper's shared pipes and directives for non-standalone components. */
@NgModule({
  declarations: [
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
})
export class SharedModule {}
