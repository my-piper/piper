import {
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  Injector,
  Type,
} from "@angular/core";
import { ModalComponent } from "./modal.component";
import { ModalContent, ModalOptions } from "./modal.types";

export type OpenComponentOptions<T> = Partial<ModalOptions> & {
  /** Set on the component before the modal renders it. */
  inputs?: { [K in keyof T]?: T[K] };
  /**
   * Element injector for the component, and the source of its environment
   * injector. Omit it when the component needs only application providers.
   */
  injector?: Injector;
};

@Injectable({ providedIn: "root" })
export class ModalService {
  private environmentInjector = inject(EnvironmentInjector);
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

  /**
   * Creates `type`, opens it in the modal and returns its ref, so callers can
   * subscribe to its outputs.
   */
  openComponent<T>(
    type: Type<T>,
    { inputs, injector, ...options }: OpenComponentOptions<T> = {},
  ): ComponentRef<T> {
    this.checkRegistration();
    const component = createComponent(type, {
      environmentInjector:
        injector?.get(EnvironmentInjector) ?? this.environmentInjector,
      elementInjector: injector,
    });
    for (const [name, value] of Object.entries(inputs ?? {})) {
      component.setInput(name, value);
    }
    this.modal.open(component, options);
    return component;
  }

  close() {
    this.checkRegistration();
    this.modal.close();
  }
}
