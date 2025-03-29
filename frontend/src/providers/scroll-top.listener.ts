import { ViewportScroller } from "@angular/common";
import { Injectable } from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";

@Injectable({ providedIn: "root" })
export class ScrollTopListener {
  constructor(router: Router, viewport: ViewportScroller) {
    router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        const navigation = router.getCurrentNavigation();
        const { scroll }: { scroll?: "top" } = navigation.extras?.state || {};
        if (scroll === "top") {
          viewport.scrollToPosition([0, 0]);
        }
      }
    });
  }
}
