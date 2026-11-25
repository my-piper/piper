import { NgModule } from "@angular/core";
import {
  TuiButton,
  TuiHint,
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
  TuiSelect,
  TuiSwitch,
  TuiTextarea,
  TuiTooltip,
} from "@taiga-ui/kit";

/**
 * The Taiga UI form controls used by the app's non-standalone components:
 * text fields, textareas, chip inputs, number and slider inputs, native selects, switches,
 * filter chips, labels, hints and tooltips, buttons, links and tables.
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
  ...TuiTextarea,
  ...TuiInputChip,
  ...TuiInputNumber,
  ...TuiInputSlider,
  ...TuiSlider,
  TuiNumberFormat,
  ...TuiSelect,
  TuiChevron,
  TuiChip,
  TuiFilter,
  TuiSwitch,
  ...TuiTable,
];

@NgModule({
  imports: TAIGA_FORMS,
  exports: TAIGA_FORMS,
})
export class TaigaFormsModule {}
