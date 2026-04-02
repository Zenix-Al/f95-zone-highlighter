import { debugLog } from "./logger";
import resourceManager from "./resourceManager.js";

const listeners = new Map();

/**
 * Adds an event listener to an element and registers it for later removal.
 * @param {string} id - A unique identifier for this listener.
 * @param {EventTarget} element - The element to attach the listener to (e.g., document, window, or an HTMLElement).
 * @param {string} eventType - The event type to listen for (e.g., 'click', 'message').
 * @param {Function} handler - The function to execute when the event is triggered.
 * @param {object|boolean} [options] - An options object or boolean for capture.
 */
export function addListener(id, element, eventType, handler, options) {
  if (listeners.has(id)) {
    debugLog("ListenerRegistry", `Listener with ID '${id}' already exists. Skipping.`, {
      level: "warn",
    });
    return;
  }

  element.addEventListener(eventType, handler, options);
  listeners.set(id, { element, eventType, handler, options });
  // Register cleanup with ResourceManager so features don't leak listeners
  resourceManager.register(id, () => {
    try {
      element.removeEventListener(eventType, handler, options);
    } catch (err) {
      debugLog("ListenerRegistry", `Failed to cleanup listener '${id}': ${err}`);
    }
  });
  debugLog(
    "ListenerRegistry",
    `Added listener '${id}' on ${element.constructor.name} for '${eventType}' event.`,
  );
}

/**
 * Removes a registered event listener by its ID.
 * @param {string} id - The unique identifier of the listener to remove.
 */
export function removeListener(id) {
  const listener = listeners.get(id);
  if (!listener) {
    return;
  }

  const { element, eventType, handler, options } = listener;
  element.removeEventListener(eventType, handler, options);
  listeners.delete(id);
  // Unregister the resource so ResourceManager doesn't attempt to cleanup again
  resourceManager.unregister(id);
  debugLog("ListenerRegistry", `Removed listener '${id}'.`);
}

/**
 * Removes all registered event listeners.
 * Useful for a full script teardown or page transition cleanup.
 */
export function removeAllListeners() {
  debugLog("ListenerRegistry", `Removing all ${listeners.size} registered listeners...`);
  for (const id of Array.from(listeners.keys())) {
    removeListener(id);
  }
}

/**
 * Create a scoped registrar for local listener management.
 * Returns an object with `reg(el, type, handler, opts)` and `dispose()`.
 * `scopeId` should be a short descriptive string for debugging.
 */
export function createRegistrar(scopeId = "scope") {
  let counter = 0;
  const ids = [];
  // Ensure this registrar instance uses a unique instance id so that
  // listener ids do not collide with previously-created but not-disposed
  // registrars (which would cause addListener to skip registrations).
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const reg = (el, type, handler, opts) => {
    const id = `${scopeId}:${instanceId}:${++counter}`;
    addListener(id, el, type, handler, opts);
    ids.push(id);
    return () => removeListener(id);
  };

  const dispose = () => {
    while (ids.length) removeListener(ids.shift());
  };

  return { reg, dispose };
}
