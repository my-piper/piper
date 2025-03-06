/// <reference types="@angular/localize" />

import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import "reflect-metadata";
import { AppRoutingModule } from "src/app/app-routing.module";

platformBrowserDynamic()
  .bootstrapModule(AppRoutingModule)
  .catch((err) => console.error(err));
