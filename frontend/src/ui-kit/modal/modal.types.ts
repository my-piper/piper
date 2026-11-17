import { ComponentRef, TemplateRef } from "@angular/core";
import { merge } from "lodash";
import { Observable } from "rxjs";

export type ModalClosedReason = "default" | "user";

export class ModalOptions {
  maxWidth? = "800px";
  maxHeight? = "90vh";
  width?: string;
  hold? = false;
  closeOutside? = true;
  title?: string;
  footer?: TemplateRef<any>;
  content?: { width: number; height: number; actionsWidth?: number };
  beforeClose?: (reason: ModalClosedReason) => Observable<boolean>;
  closed?: (reason: ModalClosedReason) => void;

  constructor(defs: Partial<ModalOptions> = null) {
    merge(this, defs);
  }
}

export type ModalContent = TemplateRef<any> | ComponentRef<any>;
