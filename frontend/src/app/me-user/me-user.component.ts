import {
  Component,
  ComponentFactoryResolver,
  Inject,
  Injector,
  OnInit,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { Router } from "@angular/router";
import { AppConfig } from "src/models/app-config";
import { HttpService } from "src/services/http.service";
import { MeManager } from "src/services/me.service";
import { Languages } from "src/ui-kit/enums/languages";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { ModalService } from "../../ui-kit/modal/modal.service";
import { ChangePasswordComponent } from "../change-password/change-password.component";
import { NsfwDisclaimer } from "../nsfw-disclaimer/nsfw-disclaimer.component";

@Component({
  selector: "app-me-user",
  templateUrl: "./me-user.component.html",
  styleUrls: ["./me-user.component.scss"],
})
export class MeUserComponent implements OnInit {
  references: { popover?: PopoverComponent } = { popover: null };

  nsfwControl = this.fb.control<boolean>(
    localStorage.getItem("nsfw") === "allow"
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
    private cfr: ComponentFactoryResolver,
    private router: Router,
    private http: HttpService
  ) {}

  ngOnInit(): void {
    this.nsfwControl.valueChanges.subscribe((allow) => {
      if (allow) {
        const component = this.cfr
          .resolveComponentFactory(NsfwDisclaimer)
          .create(this.injector);
        component.instance.ok.subscribe(() => this.modal.close());
        this.modal.open(component, {
          title: "Content disclaimer",
        });
      }
      allow
        ? localStorage.setItem("nsfw", "allow")
        : localStorage.removeItem("nsfw");
    });
  }

  changePassword() {
    this.references.popover?.hide();
    const component = this.cfr
      .resolveComponentFactory(ChangePasswordComponent)
      .create(this.injector);
    component.instance.changed.subscribe(() => this.modal.close());
    this.modal.open(component, {
      title: "Change password",
    });
  }

  logout() {
    this.config.authorization = null;
    this.router.navigate(["/login"]);
  }
}
