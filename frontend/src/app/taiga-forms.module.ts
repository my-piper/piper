import { NgModule } from "@angular/core";
import { TuiButton, TuiInput, TuiLink, TuiTextfield } from "@taiga-ui/core";
import { TuiTable } from "@taiga-ui/addon-table";
import {
  TuiButtonLoading,
  TuiChevron,
  TuiSelect,
  TuiSwitch,
} from "@taiga-ui/kit";

/**
 * The Taiga UI form controls used by the app's non-standalone components:
 * text fields, native selects, switches, buttons, links and tables.
 */
const TAIGA_FORMS = [
  TuiButton,
  TuiButtonLoading,
  TuiLink,
  ...TuiTextfield,
  ...TuiInput,
  ...TuiSelect,
  TuiChevron,
  TuiSwitch,
  ...TuiTable,
];

@NgModule({
  imports: TAIGA_FORMS,
  exports: TAIGA_FORMS,
})
export class TaigaFormsModule {}
