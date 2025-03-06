import { Component } from "@angular/core";
import { MeManager } from "src/services/me.service";

@Component({
  selector: "app-expenses",
  templateUrl: "./expenses.component.html",
  styleUrls: ["./expenses.component.scss"],
})
export class ExpensesComponent {
  constructor(public me: MeManager) {}
}
