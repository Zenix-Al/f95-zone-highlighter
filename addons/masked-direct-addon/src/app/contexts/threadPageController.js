import { MASKED_LINK_SELECTOR, RESOLVE_BTN_CLASS } from "../../constants.js";
import { isLikelyDirectDownloadAnchor, normalizeUrl } from "../../shared/utils.js";

function buttonFor(link) {
  const next = link.nextElementSibling;
  if (!(next instanceof HTMLButtonElement)) return null;
  if (!next.classList.contains(RESOLVE_BTN_CLASS)) return null;
  return next;
}

function createActionButton(type, payloadUrl) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = RESOLVE_BTN_CLASS;
  btn.dataset.addonId = "masked-direct-addon";
  btn.dataset.actionType = type;

  if (type === "masked") {
    btn.textContent = "Resolve";
    btn.title = "Resolve masked link and route download";
    btn.dataset.maskedHref = payloadUrl;
  } else {
    btn.textContent = "Direct DL";
    btn.title = "Route supported host link through direct-download flow";
    btn.dataset.directHref = payloadUrl;
  }

  return btn;
}

function toMaskedAbsoluteHref(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/masked/")) return `https://f95zone.to${raw}`;
  return raw;
}

export function createThreadPageController({
  addTeardown,
  readThreadFlags,
  routeToDirectDownload,
  showToast,
  openLinkNormally,
  resolveMaskedLink,
  isHostAllowedInSettings,
  ensureButtonStyle,
  enableAttentionListener,
}) {
  async function syncThreadLinkButton(link) {
    if (!(link instanceof HTMLAnchorElement)) return;

    const flags = await readThreadFlags(false);
    const wantsMasked = flags.skipMaskedLink !== false && link.matches(MASKED_LINK_SELECTOR);
    const wantsDirect =
      flags.directDownloadLinks !== false &&
      isLikelyDirectDownloadAnchor(link) &&
      isHostAllowedInSettings(link.hostname, flags);
    const desired = wantsMasked ? "masked" : wantsDirect ? "direct" : "";

    const existing = buttonFor(link);
    if (!desired) {
      if (existing) existing.remove();
      return;
    }

    if (existing && existing.dataset.actionType === desired) {
      if (desired === "masked") {
        const nextMaskedHref = toMaskedAbsoluteHref(link.getAttribute("href"));
        if (existing.dataset.maskedHref !== nextMaskedHref) {
          existing.dataset.maskedHref = nextMaskedHref;
          delete existing.dataset.resolvedHref;
          delete existing.dataset.resolved;
          existing.textContent = "Resolve";
        }
      } else {
        existing.dataset.directHref = normalizeUrl(link.href, "");
      }
      return;
    }

    if (existing) existing.remove();
    const payloadUrl =
      desired === "masked"
        ? toMaskedAbsoluteHref(link.getAttribute("href"))
        : normalizeUrl(link.href, "");
    link.insertAdjacentElement("afterend", createActionButton(desired, payloadUrl));
  }

  async function syncThreadButtons(root = document) {
    if (root instanceof HTMLAnchorElement) {
      await syncThreadLinkButton(root);
      return;
    }

    const links = root.querySelectorAll ? root.querySelectorAll("a[href]") : [];
    for (const link of links) {
      await syncThreadLinkButton(link);
    }
  }

  async function handleThreadResolveClick(event, { isEnabled, isBlockedByCore }) {
    const btn = event.target?.closest?.(`.${RESOLVE_BTN_CLASS}`);
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();

    if (!isEnabled || isBlockedByCore) return;

    const type = String(btn.dataset.actionType || "");
    const link =
      btn.previousElementSibling instanceof HTMLAnchorElement ? btn.previousElementSibling : null;

    if (type === "masked" && btn.dataset.resolvedHref) {
      await routeToDirectDownload(btn.dataset.resolvedHref);
      btn.textContent = "Open";
      return;
    }

    if (type === "direct") {
      const url = normalizeUrl(btn.dataset.directHref || "", "");
      if (!url) return;
      btn.disabled = true;
      showToast("Opening direct download...");
      await routeToDirectDownload(url);
      btn.disabled = false;
      return;
    }

    const maskedHref = toMaskedAbsoluteHref(btn.dataset.maskedHref || "");
    if (!maskedHref) return;

    btn.disabled = true;
    btn.textContent = "...";
    showToast("Resolving masked link...");

    let resolved = null;
    try {
      resolved = await resolveMaskedLink(maskedHref);
    } catch {
      resolved = null;
    }

    if (!resolved || resolved.status !== "ok" || !resolved.msg) {
      showToast("Could not resolve masked link.");
      showToast("Opening original link...");
      openLinkNormally(maskedHref, link);
      btn.disabled = false;
      btn.textContent = "Resolve";
      return;
    }

    const destination = normalizeUrl(resolved.msg, "");
    if (!destination) {
      showToast("Resolved URL is invalid.");
      showToast("Opening original link...");
      openLinkNormally(maskedHref, link);
      btn.disabled = false;
      btn.textContent = "Resolve";
      return;
    }

    showToast("Masked link resolved.");
    btn.dataset.resolvedHref = destination;
    btn.dataset.resolved = "true";
    await routeToDirectDownload(destination);

    btn.disabled = false;
    btn.textContent = "Open";
  }

  function enableThreadHooks({ isEnabled, isBlockedByCore }) {
    ensureButtonStyle();
    enableAttentionListener();

    const onClick = (event) => {
      void handleThreadResolveClick(event, { isEnabled, isBlockedByCore });
    };

    document.addEventListener("click", onClick, true);
    addTeardown(() => document.removeEventListener("click", onClick, true));

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          void syncThreadButtons(node);
        }
      }
    });

    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    addTeardown(() => observer.disconnect());
    addTeardown(() => {
      document.querySelectorAll(`.${RESOLVE_BTN_CLASS}`).forEach((btn) => btn.remove());
    });

    void syncThreadButtons(document);
  }

  return {
    enableThreadHooks,
  };
}
