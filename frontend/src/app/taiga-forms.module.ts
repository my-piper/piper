import { NgModule } from "@angular/core";
import {
  TuiButton,
  TuiDataList,
  TuiError,
  TuiHint,
  TuiIcon,
  TuiInput,
  TuiLabel,
  TuiLink,
  TuiNumberFormat,
  TuiSlider,
  TuiTextfield,
} from "@taiga-ui/core";
import { TuiTable } from "@taiga-ui/addon-table";
import {
  TuiButtonLoading,
  TuiChevron,
  TuiChip,
  TuiFilter,
  TuiInputChip,
  TuiInputNumber,
  TuiInputSlider,
  TuiPassword,
  TuiSegmented,
  TuiSelect,
  TuiSwitch,
  TuiTextarea,
  TuiTooltip,
} from "@taiga-ui/kit";

/**
 * The Taiga UI form controls used by the app's non-standalone components:
 * text fields, password toggles, textareas, chip inputs, number and slider inputs,
 * native selects, data lists, segmented controls, switches, filter chips, field errors,
 * labels, hints and tooltips, buttons, links and tables.
 */
const TAIGA_FORMS = [
  TuiButton,
  TuiButtonLoading,
  TuiLink,
  TuiLabel,
  ...TuiHint,
  TuiTooltip,
  ...TuiTextfield,
  ...TuiInput,
  // tuiPassword is an attribute of <tui-icon>.
  TuiIcon,
  TuiPassword,
  ...TuiTextarea,
  ...TuiInputChip,
  ...TuiInputNumber,
  ...TuiInputSlider,
  ...TuiSlider,
  TuiNumberFormat,
  ...TuiSelect,
  ...TuiDataList,
  TuiChevron,
  TuiChip,
  TuiFilter,
  TuiSegmented,
  TuiSwitch,
  ...TuiError,
  ...TuiTable,
];

@NgModule({
  imports: TAIGA_FORMS,
  exports: TAIGA_FORMS,
})
export class TaigaFormsModule {}
