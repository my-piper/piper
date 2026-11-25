/**
 * Where a Node's Variable was read from: the Global Environment (a Bound
 * Variable) or the Project's own value (an Overridden Variable).
 */
export type EnvironmentScope = "global" | "pipeline";
