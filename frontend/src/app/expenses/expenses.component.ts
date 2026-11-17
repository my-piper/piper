import { Component, ChangeDetectionStrategy } from "@angular/core";
import { MeManager } from "src/services/me.service";

@Component({
  selector: "app-expenses",
  templateUrl: "./expenses.component.html",
  styleUrls: ["./expenses.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ExpensesComponent {
  constructor(public me: MeManager) {}
}
