import { state } from "../constants";

export function waitFor(conditionFn, interval = 50, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (conditionFn()) {
        resolve(true);
      } else if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for condition"));
      } else {
        setTimeout(check, interval);
      }
    };

    check();
  });
}
export function detectPage() {
  const path = location.pathname;
  if (!window.location.hostname === "f95zone.to") return;
  if (path.startsWith("/threads")) {
    state.isThread = true;
  } else if (path.startsWith("/sam/latest_alpha")) {
    state.isLatest = true;
  }
}
