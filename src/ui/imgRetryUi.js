import imgRetryUi from "../template/imgRetryUi.html?raw";

// Inject the imported UI HTML into the page, hidden by default
export function injectUI() {
  // Avoid duplicates
  if (document.getElementById("img-retry-toast")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "image-retry-toast-wrapper";
  wrapper.innerHTML = imgRetryUi;

  document.body.appendChild(wrapper);
  const toastEl = document.getElementById("img-retry-toast");
  if (toastEl) {
    toastEl.style.display = "none";
  }
}
