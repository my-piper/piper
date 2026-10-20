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
  subscriptions: { user: () => void; room: string | null } = {
    user: null,
    room: null,
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
    // Reloading the same user (e.g. on balance updates) keeps its room.
    if (this.subscriptions.room === _id) {
      return;
    }
    this.unsubscribe();
    this.subscriptions.user = this.live.subscribe(_id);
    this.subscriptions.room = _id;
  }
  private unsubscribe() {
    this.subscriptions.user?.();
    this.subscriptions.user = null;
    this.subscriptions.room = null;
  }

  private loadUser() {
    this.http
      .get("me")
      .pipe(map((json) => plainToInstance(User, json)))
      .subscribe((user) => (this.user = user));
  }
}
