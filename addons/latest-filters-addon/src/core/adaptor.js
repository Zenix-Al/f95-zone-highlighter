import { createCoreBridge } from "../../../shared/coreBridge.js";

export function createCoreAdaptor(addonId) {
  return createCoreBridge(addonId);
}
