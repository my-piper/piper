import { Component, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { Router } from "@angular/router";
import { AppConfig } from "src/models/app-config";
import { HttpService } from "src/services/http.service";
import { MeManager } from "src/services/me.service";
import { ModalService } from "../../ui-kit/modal/modal.service";
import { ChangePasswordComponent } from "../change-password/change-password.component";
import { NsfwDisclaimer } from "../nsfw-disclaimer/nsfw-disclaimer.component";

@Component({
  selector: "app-me-user",
  templateUrl: "./me-user.component.html",
  styleUrls: ["./me-user.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class MeUserComponent implements OnInit {
  menuOpen = false;

  nsfwControl = this.fb.control<boolean>(
    localStorage.getItem("nsfw") === "allow",
  );
  form = this.fb.group({
    nsfw: this.nsfwControl,
  });

  constructor(
    public me: MeManager,
    public config: AppConfig,
    private fb: FormBuilder,
    private modal: ModalService,
    private router: Router,
    private http: HttpService,
  ) {}

  ngOnInit(): void {
    this.nsfwControl.valueChanges.subscribe((allow) => {
      if (allow) {
        const component = this.modal.openComponent(NsfwDisclaimer, {
          title: $localize`:@@label.nsfw_disclaimer:NSFW disclaimer`,
          closed: (reason) => {
            if (reason === "user") {
              this.nsfwControl.setValue(false, { emitEvent: false });
            }
          },
        });
        component.instance.agree.subscribe(() => {
          localStorage.setItem("nsfw", "allow");
          this.modal.close();
        });
      } else {
        localStorage.removeItem("nsfw");
      }
    });
  }

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
