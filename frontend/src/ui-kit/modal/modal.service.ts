import { Injectable } from "@angular/core";
import { ModalComponent } from "./modal.component";
import { ModalContent, ModalOptions } from "./modal.types";

@Injectable({ providedIn: "root" })
export class ModalService {
  private modal: ModalComponent;

  private checkRegistration() {
    if (!this.modal) {
      throw new Error("Modal component is not registered");
    }
  }

  register(modal: ModalComponent) {
    this.modal = modal;
  }

  unregister(): void {
    this.modal = null;
  }

  open(content?: ModalContent, options: Partial<ModalOptions> = {}) {
    this.checkRegistration();
    // TODO: use merge options
    this.modal.open(content, options);
  }

  close() {
    this.checkRegistration();
    this.modal.close();
  }
}
