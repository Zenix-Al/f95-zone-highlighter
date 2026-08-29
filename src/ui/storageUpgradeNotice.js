import {
  CONFIG_LEGACY_BRIDGE_VERSION,
  getLegacyUpgradeMessage,
} from "../services/configMigrationService.js";

let shown = false;

export function showStorageUpgradeNotice(error) {
  if (shown || error?.code !== "upgrade_required") return false;
  shown = true;
  if (typeof globalThis.window?.alert === "function") {
    globalThis.window.alert(`${getLegacyUpgradeMessage()}\n\nRequired bridge: core v${CONFIG_LEGACY_BRIDGE_VERSION}.`);
  }
  return true;
}

export function resetStorageUpgradeNoticeForTests() {
  shown = false;
}
