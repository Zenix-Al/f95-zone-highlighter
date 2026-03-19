import stateManager from "../../config.js";
import {
  initTagSearchListeners,
  renderExcluded,
  renderMarked,
  renderPreferred,
} from "../components/tag-search/index.js";
import { renderSettingsSection } from "../renderers/settingsSection";
import { handleModalClick, handleOutsideSearchClick } from "../components/listeners";
import { injectModal } from "../components/modal";
import { addListener } from "../../core/listenerRegistry";
import { showToast } from "../components/toast";
import { colorSettingsMeta } from "./colorSettings";
import { globalSettingsMeta } from "./globalSettings";
import { latestSettingsMeta } from "./latestSettings";
import { renderDirectDownloadHealthNotices, threadSettingsMeta } from "./threadSettings";
import { showAllTags, updateSearch, updateTags } from "../../services/tagsService";
import { checkTags } from "../../services/safetyService";

function handleAccordionSummaryClick(event) {
  const summary = event.target?.closest?.(".config-list-details > summary");
  if (!summary) return;

  const details = summary.parentElement;
  if (!details || !details.classList?.contains("config-list-details")) return;

  event.preventDefault();

  const modal = details.closest("#tag-config-modal");
  if (!modal) return;

  function stopAnimation(targetDetails) {
    const anim = targetDetails?._anim;
    if (!anim) return;
    // Prevent cancel from re-entering stale handlers.
    anim.onfinish = null;
    anim.oncancel = null;
    anim.cancel();
    targetDetails._anim = null;
  }

  // Cancel any running animation on this details
  stopAnimation(details);

  // Helper: animate a content element between two heights and resolve on finish
  function animateContent(content, fromPx, toPx, duration = 220) {
    content.style.overflow = "hidden";
    content.style.height = fromPx + "px";
    // Use WAAPI for precise control and to allow cancelling
    const anim = content.animate([{ height: fromPx + "px" }, { height: toPx + "px" }], {
      duration,
      easing: "cubic-bezier(.2,.9,.2,1)",
      fill: "forwards",
    });
    return anim;
  }

  // Find the content container to animate (we animate the settings area only)
  const content = details.querySelector(":scope > .settings-wrapper");
  const isOpening = !details.open;

  if (!content) {
    // Fallback to native toggle if structure differs
    details.open = isOpening;
    return;
  }

  if (isOpening) {
    // Prepare for open: set height 0, flip open so layout computes scrollHeight
    content.style.height = "0px";
    details.open = true;
    const endH = content.scrollHeight;
    stopAnimation(details);
    details._anim = animateContent(content, 0, endH);
    details._anim.onfinish = () => {
      stopAnimation(details);
      // Keep open sections naturally sized so dynamic content updates
      // (diagnostics, tags, etc.) don't get stuck at the old height.
      content.style.height = "auto";
      content.style.overflow = "visible";
    };
    details._anim.oncancel = () => {
      content.style.height = "";
      content.style.overflow = "";
      details._anim = null;
    };
  } else {
    // Closing: animate from current computed height to 0, then clear and set open=false
    const startH = content.scrollHeight || content.getBoundingClientRect().height;
    content.style.height = startH + "px";
    stopAnimation(details);
    details._anim = animateContent(content, startH, 0);
    details._anim.onfinish = () => {
      stopAnimation(details);
      details.open = false;
      content.style.height = "";
      content.style.overflow = "";
    };
    details._anim.oncancel = () => {
      content.style.height = "";
      content.style.overflow = "";
      details._anim = null;
    };
  }

  // Close any other open details with an animated close to avoid jumps
  modal.querySelectorAll(".config-list-details[open]").forEach((openDetails) => {
    if (openDetails === details) return;
    const openContent = openDetails.querySelector(":scope > .settings-wrapper");
    if (!openContent) {
      openDetails.open = false;
      return;
    }
    stopAnimation(openDetails);
    const startH = openContent.scrollHeight || openContent.getBoundingClientRect().height;
    openDetails._anim = animateContent(openContent, startH, 0, 180);
    openDetails._anim.onfinish = () => {
      stopAnimation(openDetails);
      openDetails.open = false;
      openContent.style.height = "";
      openContent.style.overflow = "";
    };
    openDetails._anim.oncancel = () => {
      openContent.style.height = "";
      openContent.style.overflow = "";
      openDetails._anim = null;
    };
  });
}

export function initModalUi() {
  if (!stateManager.get("modalInjected")) {
    stateManager.set("modalInjected", true);
    injectModal();

    // --- Set up one-time listeners for the modal ---
    const shadowRoot = stateManager.get("shadowRoot");
    if (!shadowRoot) return; // Should not happen if modal was injected

    // Listeners for the tag search input
    const searchInput = shadowRoot.getElementById("tags-search");
    if (searchInput) {
      addListener("tags-search-input", searchInput, "input", updateSearch);
      addListener("tags-search-focus", searchInput, "focus", showAllTags);
    }

    // Initialize delegated listeners for tag search results and tag lists
    initTagSearchListeners();

    // Main delegated click listener for modal buttons (close, reset, etc.)
    const modal = shadowRoot.getElementById("tag-config-modal");
    if (modal) {
      addListener("modal-delegated-click", modal, "click", handleModalClick);
      addListener("modal-accordion-summary", modal, "click", handleAccordionSummaryClick);
    }

    // Listener to close search results when clicking outside
    addListener("outside-search-click", document, "click", handleOutsideSearchClick);
  }
  if (!stateManager.get("globalSettingsRendered")) {
    stateManager.set("globalSettingsRendered", true);
    renderSettingsSection("global-settings-container", globalSettingsMeta);
  }
  if (!stateManager.get("colorRendered")) {
    stateManager.set("colorRendered", true);
    renderSettingsSection("color-container", colorSettingsMeta);
  }
  if (!stateManager.get("overlayRendered")) {
    stateManager.set("overlayRendered", true);
    updateLatestUI();
  }
  if (!stateManager.get("threadSettingsRendered")) {
    stateManager.set("threadSettingsRendered", true);
    updateThreadUI();
  }
  renderDirectDownloadHealthNotices();

  // Kick off the tag update process once per session.
  // Running it on every modal open would re-render chips mid-drag and kill in-progress drags.
  if (!stateManager.get("tagsUpdateRan")) {
    stateManager.set("tagsUpdateRan", true);
    (async () => {
      try {
        const result = await updateTags();
        if (result?.pruned && result.count > 0) {
          showToast(`${result.count} obsolete tag(s) removed from your lists.`);
        }
        renderPreferred();
        renderExcluded();
        renderMarked();
        checkTags();
      } catch (err) {
        // best-effort: don't block UI on errors
        console.warn("updateTags failed:", err);
      }
    })();
  }
}

export function updateLatestUI() {
  renderSettingsSection("latest-settings-container", latestSettingsMeta);
}

export function updateThreadUI() {
  renderSettingsSection("thread-settings-container", threadSettingsMeta);
  renderDirectDownloadHealthNotices();
}
