let observer = null;
const callbacks = new Map();

/**
 * The main callback that runs when the MutationObserver detects changes.
 * It iterates over all registered feature callbacks.
 * @param {MutationRecord[]} mutationsList
 * @param {MutationObserver} obs
 */
function masterCallback(mutationsList, obs) {
  for (const callback of callbacks.values()) {
    try {
      callback(mutationsList, obs);
    } catch (error) {
      console.error("Error in shared observer callback:", error);
    }
  }
}

/**
 * Starts the shared MutationObserver if it's not already running.
 */
function startObserver() {
  if (observer) return; // Already running

  observer = new MutationObserver(masterCallback);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Stops the shared MutationObserver if no callbacks are registered.
 */
function stopObserver() {
  if (observer && callbacks.size === 0) {
    observer.disconnect();
    observer = null;
  }
}

export function addObserverCallback(id, callback) {
  if (callbacks.has(id)) return;
  callbacks.set(id, callback);
  startObserver();
}

export function removeObserverCallback(id) {
  callbacks.delete(id);
  stopObserver();
}
