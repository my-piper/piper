import { Component, ChangeDetectionStrategy } from "@angular/core";
import { Router } from "@angular/router";
import { AppConfig } from "src/models/app-config";
import { HttpService } from "src/services/http.service";
import { MeManager } from "src/services/me.service";
import { ModalService } from "../../ui-kit/modal/modal.service";
import { ChangePasswordComponent } from "../change-password/change-password.component";

@Component({
  selector: "app-me-user",
  templateUrl: "./me-user.component.html",
  styleUrls: ["./me-user.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class MeUserComponent {
  menuOpen = false;

  constructor(
    public me: MeManager,
    public config: AppConfig,
    private modal: ModalService,
    private router: Router,
    private http: HttpService,
  ) {}

  changePassword() {
    this.menuOpen = false;
    const component = this.modal.openComponent(ChangePasswordComponent, {
      title: $localize`:@@label.change_password:Change password`,
    });
    component.instance.changed.subscribe(() => this.modal.close());
  }

  logout() {
    this.menuOpen = false;
    this.config.authorization = null;
    this.router.navigate(["/login"]);
  }
}
