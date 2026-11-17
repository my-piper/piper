import {
  createComponent,
  EnvironmentInjector,
  Component,
  Inject,
  Injector,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { Router } from "@angular/router";
import { AppConfig } from "src/models/app-config";
import { HttpService } from "src/services/http.service";
import { MeManager } from "src/services/me.service";
import { Languages } from "src/enums/languages";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { CURRENT_LANGUAGE } from "src/providers/current-language";
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
  references: { popover?: PopoverComponent } = { popover: null };

  nsfwControl = this.fb.control<boolean>(
    localStorage.getItem("nsfw") === "allow",
  );
  form = this.fb.group({
    nsfw: this.nsfwControl,
  });

  constructor(
    @Inject(CURRENT_LANGUAGE) public language: Languages,
    public me: MeManager,
    public config: AppConfig,
    private fb: FormBuilder,
    private injector: Injector,
    private modal: ModalService,
    private environmentInjector: EnvironmentInjector,
    private router: Router,
    private http: HttpService,
  ) {}

  ngOnInit(): void {
    this.nsfwControl.valueChanges.subscribe((allow) => {
      if (allow) {
        const component = createComponent(NsfwDisclaimer, {
          environmentInjector: this.environmentInjector,
          elementInjector: this.injector,
        });
        component.instance.agree.subscribe(() => {
          localStorage.setItem("nsfw", "allow");
          this.modal.close();
        });
        this.modal.open(component, {
          title: $localize`:@@label.nsfw_disclaimer:NSFW disclaimer`,
          closed: (reason) => {
            if (reason === "user") {
              this.nsfwControl.setValue(false, { emitEvent: false });
            }
          },
        });
      } else {
        localStorage.removeItem("nsfw");
      }
    });
  }

  changePassword() {
    this.references.popover?.hide();
    const component = createComponent(ChangePasswordComponent, {
      environmentInjector: this.environmentInjector,
      elementInjector: this.injector,
    });
    component.instance.changed.subscribe(() => this.modal.close());
    this.modal.open(component, {
      title: $localize`:@@label.change_password:Change password`,
    });
  }

  logout() {
    this.config.authorization = null;
    this.router.navigate(["/login"]);
  }
}
