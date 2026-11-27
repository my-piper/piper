/**
 * Input types a node output of `type` can be wired to, as
 * EditPipelineVisualComponent.addNodeFlow accepts them: JSON feeds scalars
 * through a transformer, a single image and an image list feed each other.
 */
export function acceptedInputTypes(type: string): string[] {
  switch (type) {
    case "json":
      return ["json", "string", "integer", "float", "boolean"];
    case "image":
    case "image[]":
      return ["image", "image[]"];
    default:
      return [type];
  }
}
