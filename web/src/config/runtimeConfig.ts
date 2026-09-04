import { computeRuntimeConfig, DEFAULT_RAW_CONFIG, type RuntimeConfig } from "./computeRuntimeConfig";

export type { RuntimeConfig };
export const runtimeConfig: RuntimeConfig = computeRuntimeConfig(window.BUTTON_CONFIG || DEFAULT_RAW_CONFIG);
