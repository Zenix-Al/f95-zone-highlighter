import { confirmDialog, openDialog, updateDialog } from "../../api/ui/dialog.js";
import { mountUi, updateUi } from "../../api/ui/mount.js";
import { registerStyle, unregisterStyle } from "../../api/ui/style.js";
import {
  EXAMPLE_DIALOG_ID,
  EXAMPLE_EXTRA_MOUNT_ID,
  EXAMPLE_STYLE_ID,
} from "../../constants.js";
import exampleCssText from "../../ui/example.css";
import { renderExampleDialog } from "../../ui/dialog.js";
import { renderExtraMount } from "../../ui/extraMount.js";

export function createUiActions({
  core,
  state,
  ensureDockButtons,
  removeExampleDockButtons,
  unmountExtra,
  openExamplePanel,
  closeExamplePanel,
  closeExampleDialog,
}) {
  return {
    "panel-open": () => openExamplePanel(),
    "panel-close": () => closeExamplePanel("panel-button"),
    "style-register": async () => {
      const result = await registerStyle(core, EXAMPLE_STYLE_ID, exampleCssText);
      if (result?.ok) state.ui.styleRegistered = true;
      return result;
    },
    "style-unregister": async () => {
      const result = await unregisterStyle(core, EXAMPLE_STYLE_ID);
      if (result?.ok) state.ui.styleRegistered = false;
      return result;
    },
    "mount-extra": async () => {
      const nextRevision = state.ui.extraMountRevision + 1;
      const result = await mountUi(core, {
        mountId: EXAMPLE_EXTRA_MOUNT_ID,
        slot: "body",
        html: renderExtraMount(nextRevision),
      });
      if (result?.ok) {
        state.ui.extraMountActive = true;
        state.ui.extraMountRevision = nextRevision;
      }
      return result;
    },
    "update-extra": async () => {
      const nextRevision = state.ui.extraMountRevision + 1;
      const result = await updateUi(core, {
        mountId: EXAMPLE_EXTRA_MOUNT_ID,
        html: renderExtraMount(nextRevision),
      });
      if (result?.ok) {
        state.ui.extraMountActive = true;
        state.ui.extraMountRevision = nextRevision;
      }
      return result;
    },
    "unmount-extra": () => unmountExtra(),
    "dialog-open": async () => {
      const result = await openDialog(core, {
        dialogId: EXAMPLE_DIALOG_ID,
        title: "Example Add-on Dialog",
        html: renderExampleDialog(),
        size: "sm",
      });
      if (result?.ok) state.ui.dialogOpen = true;
      return result;
    },
    "dialog-update": () =>
      updateDialog(
        core,
        EXAMPLE_DIALOG_ID,
        `${renderExampleDialog()}<p>Dialog content updated through <code>ui.dialog.update</code>.</p>`,
      ),
    "dialog-confirm": async () => {
      const result = await confirmDialog(core, {
        title: "ui.confirm example",
        description: "Did the example confirm dialog open correctly?",
        confirmLabel: "Yep",
        cancelLabel: "Nope",
      });
      state.ui.lastConfirm = result?.ok
        ? String(result?.value?.confirmed)
        : `error:${result?.reason || "unknown"}`;
      return result;
    },
    "dialog-close": () => closeExampleDialog("example-button"),
    "dock-set": () => ensureDockButtons(),
    "dock-remove": () => removeExampleDockButtons(),
  };
}
