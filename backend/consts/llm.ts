import env from "core-kit/env";

export const ACTIVATE_ASSISTANT = env["ACTIVATE_ASSISTANT"] === "yes";
export const LLM_API_KEY = env["LLM_API_KEY"] || "xyzXYZ";
export const LLM_MODEL = env["LLM_MODEL"] || "gpt-4.1";
export const LLM_MODEL_FOR_TRANSLATION =
  env["LLM_MODEL_FOR_TRANSLATION"] || "gpt-4.1-mini";
