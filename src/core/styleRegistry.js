import stateManager from "../config.js";
import resourceManager from "./resourceManager.js";

const styles = new Map();

function resolveTargetContainer(target = "document") {
  if (target === "shadow") {
    return stateManager.get("shadowRoot");
  }

  if (target === "document") {
    return document.head || document.documentElement;
  }

  return target || null;
}

function removeStyleElement(entry) {
  if (!entry?.element) return;
  if (entry.element.parentNode) {
    entry.element.parentNode.removeChild(entry.element);
  }
}

export function acquireStyle(id, cssText, target = "document") {
  if (!id || typeof cssText !== "string") return null;

  const container = resolveTargetContainer(target);
  if (!container) return null;

  const existing = styles.get(id);
  if (!existing) {
    const style = document.createElement("style");
    style.dataset.styleId = id;
    style.textContent = cssText;
    container.appendChild(style);

    styles.set(id, {
      id,
      cssText,
      target,
      refs: 1,
      element: style,
    });

    resourceManager.register(`style:${id}`, () => {
      removeStyle(id, { force: true, unregister: false });
    });

    return style;
  }

  existing.refs += 1;

  const targetChanged = existing.target !== target;
  const cssChanged = existing.cssText !== cssText;
  if (targetChanged || cssChanged) {
    removeStyleElement(existing);

    const nextContainer = resolveTargetContainer(target);
    if (!nextContainer) return null;

    const nextStyle = document.createElement("style");
    nextStyle.dataset.styleId = id;
    nextStyle.textContent = cssText;
    nextContainer.appendChild(nextStyle);

    existing.element = nextStyle;
    existing.target = target;
    existing.cssText = cssText;
  }

  return existing.element;
}

export function removeStyle(id, { force = false, unregister = true } = {}) {
  const existing = styles.get(id);
  if (!existing) return;

  if (!force) {
    existing.refs -= 1;
    if (existing.refs > 0) return;
  }

  removeStyleElement(existing);
  styles.delete(id);

  if (unregister) {
    resourceManager.unregister(`style:${id}`);
  }
}

export function clearAllStyles() {
  for (const id of Array.from(styles.keys())) {
    removeStyle(id, { force: true });
  }
}

export function getStyleRegistrySnapshot() {
  const snapshot = {};
  for (const [id, entry] of styles.entries()) {
    snapshot[id] = {
      refs: entry.refs,
      target: entry.target,
      cssLength: entry.cssText.length,
      attached: Boolean(entry.element?.isConnected),
    };
  }
  return snapshot;
}
