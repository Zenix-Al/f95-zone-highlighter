import { getPageContext } from "../api/page.js";
import { waitForElement } from "../api/observer.js";

export function createMaskedDirectPageBehavior({
  bridge,
  runtime,
  clearOwnedResources,
  getIsEnabled,
  getIsBlocked,
  getLocalPageContext,
  isF95AddonPage,
  directDownloadAttentionController,
  threadPageController,
  maskedPageController,
  downloadPageController,
  directDownloadFlowController,
}) {
  async function apply() {
    clearOwnedResources();
    if (!getIsEnabled() || getIsBlocked()) return;

    const pageContext = await getPageContext(bridge, getLocalPageContext);
    const threadPage = pageContext?.pageScopes?.includes("thread") || false;
    if (threadPage) {
      await waitForElement(
        bridge,
        "masked-direct-page-ready",
        "body",
        2500,
        () => ({ ok: false, reason: "unsupported_action" }),
      );
    }

    try {
      if (isF95AddonPage()) {
        directDownloadAttentionController.enableDirectDownloadAttentionListener({
          shouldListen: isF95AddonPage,
        });
      }
      if (threadPage) {
        threadPageController.enableThreadHooks({
          isEnabled: getIsEnabled(),
          isBlockedByCore: getIsBlocked(),
        });
      }
      if (maskedPageController.isMaskedPage()) {
        maskedPageController.enableMaskedPageHooks({
          isEnabled: getIsEnabled(),
          isBlockedByCore: getIsBlocked(),
        });
      }
      if (maskedPageController.isRecaptchaFrame()) {
        maskedPageController.handleRecaptcha();
      }
    } catch (error) {
      const message = error?.message
        ? String(error.message)
        : String(error ?? "Unknown error");
      console.error(`[${runtime.addonId}] Page behavior setup error:`, error);
      bridge.dispatchCoreCommand("update-status", {
        addonId: runtime.addonId,
        status: "error",
        statusMessage: `Page behavior setup failed: ${message}`,
      });
      return;
    }

    void downloadPageController.runDownloadPageHooks().catch((error) => {
      void directDownloadFlowController.notifyMainFailure(
        downloadPageController.getDownloadHost() || "unknown",
        error?.message || String(error),
      );
    });
  }

  return { apply };
}
