import env from "../../env";

export const LOG_LEVEL = env["LOG_LEVEL"] || "info";
export const LOG_PRETTY = !!env["LOG_PRETTY"];
