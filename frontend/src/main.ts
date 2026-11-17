/// <reference types="@angular/localize" />

import { provideZoneChangeDetection } from "@angular/core";
import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import "reflect-metadata";
import { AppRoutingModule } from "src/app/app-routing.module";

platformBrowserDynamic()
  .bootstrapModule(AppRoutingModule, {
    applicationProviders: [provideZoneChangeDetection()],
  })
  .catch((err) => console.error(err));
