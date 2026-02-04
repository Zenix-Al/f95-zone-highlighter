// cores/observer.js
export function observeDom(callback) {
  new MutationObserver(callback).observe(document.body, {
    childList: true,
    subtree: true,
  });
}
