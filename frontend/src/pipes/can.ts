import { Pipe, PipeTransform } from "@angular/core";
import { BehaviorSubject, Observable, skip } from "rxjs";
import { User, UserRole } from "src/models/user";
import { MeManager } from "src/services/me.service";

@Pipe({ name: "can" })
export class CanPipe implements PipeTransform {
  private can: BehaviorSubject<boolean>;

  constructor(private me: MeManager) {}

  transform(targetRole: UserRole, owner: User = null): Observable<boolean> {
    if (!!this.can) {
      return this.can;
    }

    const can = (currentUser: User) => {
      if (!!currentUser) {
        if (!!owner) {
          if (owner?._id === currentUser?._id) {
            return true;
          }
        }
        if (currentUser?.roles?.includes(targetRole)) {
          return true;
        }
      }

      return false;
    };
    const { user: currentUser } = this.me;
    this.can = new BehaviorSubject<boolean>(can(currentUser));
    this.me.user$.pipe(skip(1)).subscribe((user) => this.can.next(can(user)));
    return this.can;
  }
}
