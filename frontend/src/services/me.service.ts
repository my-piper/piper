import { Injectable } from "@angular/core";
import { plainToInstance } from "class-transformer";
import { BehaviorSubject, map } from "rxjs";
import { USER_KEY } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import { BalanceUpdatedEvent } from "src/models/events";
import { User } from "src/models/user";
import { toPlain } from "src/utils/models";
import { HttpService } from "./http.service";
import { LiveService } from "./live.service";

@Injectable({ providedIn: "root" })
export class MeManager {
  subscriptions: { user: () => void } = {
    user: null,
  };

  user$ = new BehaviorSubject<User | null>(
    (() => {
      const json = localStorage.getItem(USER_KEY);
      return !!json ? plainToInstance(User, JSON.parse(json)) : null;
    })()
  );

  private set user(user: User | null) {
    this.user$.next(user);

    if (!!user) {
      localStorage.setItem(USER_KEY, JSON.stringify(toPlain(user)));
      this.subscribe();
    } else {
      localStorage.removeItem(USER_KEY);
      this.unsubscribe();
    }
  }

  get user() {
    return this.user$.getValue();
  }

  constructor(
    private config: AppConfig,
    private live: LiveService,
    private http: HttpService
  ) {
    this.config.authorization$.subscribe((authorization) => {
      if (!!authorization) {
        this.loadUser();
      } else {
        this.user = null;
      }
    });
    this.live.socket
      .fromEvent<Object>("user_balance_updated")
      .pipe(map((json) => plainToInstance(BalanceUpdatedEvent, json)))
      .subscribe(() => this.loadUser());
  }

  private subscribe() {
    const { _id } = this.user;
    this.subscriptions.user = this.live.subscribe(_id);
  }
  private unsubscribe() {
    this.subscriptions.user?.();
  }

  private loadUser() {
    this.http
      .get("me")
      .pipe(map((json) => plainToInstance(User, json)))
      .subscribe((user) => (this.user = user));
  }
}
