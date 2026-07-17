/* global __ADDON_ID__ */
import { bootstrapMaskedDirectAddon } from "./app/createMaskedDirectApp.js";

void bootstrapMaskedDirectAddon().catch((error) => {
  const addonId =
    typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "masked-direct-addon";
  console.error(`[${addonId}] Bootstrap failed:`, error);
});
