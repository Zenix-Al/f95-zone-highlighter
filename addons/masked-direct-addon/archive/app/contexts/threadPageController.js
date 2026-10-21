import { MASKED_LINK_SELECTOR, RESOLVE_BTN_CLASS } from "../../constants.js";
import { isLikelyDirectDownloadAnchor, normalizeUrl } from "../../shared/utils.js";

const THREAD_LINK_OBSERVER_ID = "masked-direct-thread-links";

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
  diagnostics,
  openLinkNormally,
  resolveMaskedLink,
  isHostAllowedInSettings,
  ensureButtonStyle,
  enableAttentionListener,
  watchElements,
  unwatchElements,
}) {
  let pendingRoots = new Set();
  let syncPending = false;

  async function syncThreadLinkButton(link, flags) {
    if (!(link instanceof HTMLAnchorElement)) return;

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
    const flags = await readThreadFlags(false);
    if (root instanceof HTMLAnchorElement) {
      await syncThreadLinkButton(root, flags);
      return;
    }

    const links = root.querySelectorAll ? root.querySelectorAll("a[href]") : [];
    for (const link of links) {
      await syncThreadLinkButton(link, flags);
    }
  }

  function queueThreadButtonSync(nodes) {
    for (const node of nodes || []) {
      if (node instanceof Element) pendingRoots.add(node);
    }
    if (syncPending || pendingRoots.size === 0) return;
    syncPending = true;
    queueMicrotask(async () => {
      const roots = pendingRoots;
      pendingRoots = new Set();
      try {
        const flags = await readThreadFlags(false);
        const links = new Set();
        for (const root of roots) {
          if (root instanceof HTMLAnchorElement) links.add(root);
          for (const link of root.querySelectorAll?.("a[href]") || []) links.add(link);
        }
        for (const link of links) await syncThreadLinkButton(link, flags);
      } finally {
        syncPending = false;
        if (pendingRoots.size > 0) queueThreadButtonSync([]);
      }
    });
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
      await routeToDirectDownload(url);
      btn.disabled = false;
      return;
    }

    const maskedHref = toMaskedAbsoluteHref(btn.dataset.maskedHref || "");
    if (!maskedHref) return;

    btn.disabled = true;
    btn.textContent = "...";

    let resolved = null;
    try {
      resolved = await resolveMaskedLink(maskedHref);
    } catch {
      resolved = null;
    }

    if (!resolved || resolved.status !== "ok" || !resolved.msg) {
      diagnostics.warn("masked_link_resolution_failed");
      openLinkNormally(maskedHref, link);
      btn.disabled = false;
      btn.textContent = "Resolve";
      return;
    }

    const destination = normalizeUrl(resolved.msg, "");
    if (!destination) {
      diagnostics.warn("masked_link_invalid_destination");
      openLinkNormally(maskedHref, link);
      btn.disabled = false;
      btn.textContent = "Resolve";
      return;
    }

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

    void watchElements(THREAD_LINK_OBSERVER_ID);
    addTeardown(() => void unwatchElements(THREAD_LINK_OBSERVER_ID));
    addTeardown(() => {
      pendingRoots.clear();
      document.querySelectorAll(`.${RESOLVE_BTN_CLASS}`).forEach((btn) => btn.remove());
    });

    void syncThreadButtons(document);
  }

  return {
    enableThreadHooks,
    handleObservedNodes(observerId, nodes) {
      if (observerId === THREAD_LINK_OBSERVER_ID) queueThreadButtonSync(nodes);
    },
  };
}
