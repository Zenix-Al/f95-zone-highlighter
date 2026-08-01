import { stateManager } from "../../src/config.js";
import {
  openConfirmDialog,
  openReorderDialog,
  openSettingsDialog,
  openTextPrompt,
} from "../../src/ui/components/dialog.js";

export function setDialogRoot(root) {
  stateManager.set("shadowRoot", root);
}

export {
  openConfirmDialog,
  openReorderDialog,
  openSettingsDialog,
  openTextPrompt,
};
