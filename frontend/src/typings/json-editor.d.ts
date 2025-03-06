declare module "@json-editor/json-editor" {
  interface JSONEditorOptions {
    // Define the properties of JSONEditorOptions here
  }

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
    on(event: string, callback: () => void): void;
  }
  export { JSONEditor };
}
