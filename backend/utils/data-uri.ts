/**
 * Checks if a string is a data URI
 */
export function isDataUri(value: string): boolean {
  return typeof value === "string" && value.startsWith("data:");
}
