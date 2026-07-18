import { createIdbActions } from "./idb.js";
import { createMetadataActions } from "./metadata.js";
import { createObserverActions } from "./observer.js";
import { createStorageActions } from "./storage.js";
import { createUiActions } from "./ui.js";

export function createExampleActions(options) {
  const handlers = {
    ...createMetadataActions(options),
    ...createStorageActions(options),
    ...createIdbActions(options),
    ...createObserverActions(options),
    ...createUiActions(options),
  };

  async function handle(action) {
    if (!options.isAvailable()) return;
    const handler = handlers[action];
    if (!handler) return;
    const result = await handler();
    options.setLastResult(action, result);

    if (
      action === "panel-close" ||
      action === "feature-disable" ||
      action === "bulk-import-cancel"
    ) {
      return;
    }
    await options.syncPanel();
  }

  return { handle };
}
