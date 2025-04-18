import { ChangeDetectorRef, Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import last from "lodash/last";
import { delay, finalize, map, merge } from "rxjs";
import { User, UserRole, UsersFilter } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";
import { toPlain } from "src/utils/models";
import { PopoverComponent } from "../../ui-kit/popover/popover.component";
import { EditUserComponent } from "./edit/edit-user.component";

@Component({
  selector: "app-users",
  templateUrl: "./users.component.html",
  styleUrls: ["./users.component.scss"],
})
export class UsersComponent {
  userRole = UserRole;

  private _modal!: EditUserComponent;

  error!: Error;
  progress = { loading: false, deleting: false };

  references: { popover: PopoverComponent } = { popover: null };

  set modal(modal: EditUserComponent) {
    this._modal = modal;
    if (!!modal) {
      modal.added.subscribe((user) => this.users.unshift(user));
      modal.saved.subscribe((user) => {
        const index = this.users.findIndex((u) => u._id === user._id);
        if (index !== -1) {
          assign(this.users[index], user);
          this.cd.detectChanges();
        }
      });

      merge(modal.added, modal.saved).subscribe(() =>
        this.router.navigate(["./"], { relativeTo: this.route })
      );
    }
  }

  get modal() {
    return this._modal;
  }

  chunk: User[] = [];
  users: User[] = [];

  constructor(
    private http: HttpService,
    private route: ActivatedRoute,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.load();
  }

  back() {
    this.router.navigate(["./"], { relativeTo: this.route });
  }

  private load(cursor?: string) {
    this.progress.loading = true;
    this.cd.detectChanges();

    this.http
      .get("users", toPlain(new UsersFilter({ cursor })))
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as Object[]).map((plain) => plainToInstance(User, plain))
        ),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: (users) => {
          this.chunk = users;
          this.users.push(...users);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }

  loadMore() {
    const user = last(this.users);
    if (!!user) {
      this.load(user.cursor);
    }
  }

  remove(index: number, { _id }: User) {
    this.progress.deleting = true;
    this.cd.detectChanges();

    this.http
      .delete(`users/${_id}`)
      .pipe(
        delay(UI_DELAY),
        finalize(() => {
          this.progress.deleting = false;
          this.references?.popover?.hide();
          this.cd.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.users.splice(index, 1);
          this.cd.detectChanges();
        },
        error: (err) => (this.error = err),
      });
  }
}
