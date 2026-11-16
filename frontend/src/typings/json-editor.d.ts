declare module "@json-editor/json-editor" {
  // Options are not typed yet; any object is accepted.
  type JSONEditorOptions = object;

  class JSONEditor {
    constructor(element: HTMLElement, options: JSONEditorOptions);

    set(value: object): void;
    getEditor(path: string): any;
    setValue(value: object): void;
    getValue(): object;
    showValidationErrors(): void;
    theme: {
      getDescription: (text: string) => void;
    };
    validate(): any[];
    destroy(): void;
    on(event: string, callback: (...args: any) => void): void;
  }
  export { JSONEditor };
}
