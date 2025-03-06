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

    const { user: currentUser } = this.me;
    const can = () =>
      currentUser?.roles?.includes(targetRole) ||
      owner?._id === currentUser?._id;
    this.me.user$.pipe(skip(1)).subscribe(() => this.can.next(can()));

    this.can = new BehaviorSubject<boolean>(can());
    return this.can;
  }
}
