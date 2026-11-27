import {
  ChangeDetectorRef,
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { TuiDialogService } from "@taiga-ui/core";
import { plainToInstance } from "class-transformer";
import assign from "lodash/assign";
import escape from "lodash/escape";
import last from "lodash/last";
import { delay, finalize, map, merge } from "rxjs";
import { DisplayError } from "src/models/errors";
import { User, UserRole, UsersFilter } from "src/models/user";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/consts/ui";
import { confirmDelete } from "src/utils/confirm-delete";
import { mapTo, toPlain } from "src/utils/models";
import { EditUserComponent } from "./edit/edit-user.component";

@Component({
  selector: "app-users",
  templateUrl: "./users.component.html",
  styleUrls: ["./users.component.scss"],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class UsersComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogs = inject(TuiDialogService);

  userRole = UserRole;

  private _modal!: EditUserComponent;

  error!: DisplayError;
  progress = { loading: false, deleting: false };

  set modal(modal: EditUserComponent) {
    this._modal = modal;
    if (modal) {
      modal.added.subscribe((user) => this.users.unshift(user));
      modal.saved.subscribe((user) => {
        const index = this.users.findIndex((u) => u._id === user._id);
        if (index !== -1) {
          assign(this.users[index], user);
          this.cd.detectChanges();
        }
      });

      merge(modal.added, modal.saved).subscribe(() =>
        this.router.navigate(["./"], { relativeTo: this.route }),
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
    private cd: ChangeDetectorRef,
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
      .get("users", toPlain(mapTo({ cursor }, UsersFilter)))
      .pipe(
        delay(UI_DELAY),
        map((arr) =>
          (arr as object[]).map((plain) => plainToInstance(User, plain)),
        ),
        finalize(() => {
          this.progress.loading = false;
          this.cd.detectChanges();
        }),
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
    if (user) {
      this.load(user.cursor);
    }
  }

  confirmRemove(user: User) {
    confirmDelete(
      this.dialogs,
      $localize`:@@message.confirm_delete_user_label:Delete user?`,
      $localize`:@@message.confirm_delete_user:User «${escape(user._id)}:login:» will be deleted. This can't be undone.`,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // the list may have changed while the dialog was open
        const index = this.users.indexOf(user);
        if (index !== -1) {
          this.remove(index, user);
        }
      });
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
          this.cd.detectChanges();
        }),
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
