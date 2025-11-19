import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { InspectComponent } from "./inspect.component";

@NgModule({
  imports: [CommonModule],
  exports: [InspectComponent],
  declarations: [InspectComponent],
})
export class InspectModule {}
