// === F95UE Image Repair - Manual Test Trigger ===
// Paste this in console on any thread page

(() => {
  console.log("%c[Image Repair Test] Starting manual test...", "color: #ec5555; font-weight: bold");

  // Force enable the feature if it's not already
  if (window.__F95UE_IMAGE_REPAIR_ADDON__) {
    window.__F95UE_IMAGE_REPAIR_ADDON__.enable();
    console.log("%c[Image Repair Test] Feature enabled via console.", "color: #4CAF50");
  } else {
    console.warn(
      "%c[Image Repair Test] Image Repair addon not detected. Make sure the main F95UE + Image Repair addon are installed.",
      "color: #ff9800",
    );
  }

  // Trigger a full re-scan of all attachment images
  setTimeout(() => {
    const images = document.querySelectorAll('img[src^="https://attachments.f95zone.to/"]');
    console.log(
      `%c[Image Repair Test] Found ${images.length} attachment images. Forcing retry check...`,
      "color: #2196F3",
    );

    images.forEach((img, i) => {
      if (img.dataset.retryAttached !== "true") {
        console.log(`%c[Image Repair Test] Queuing image ${i + 1}: ${img.src}`, "color: #9C27B0");
        img.dispatchEvent(new Event("error", { bubbles: true })); // Simulate broken image to trigger retry
      }
    });

    if (images.length === 0) {
      console.log(
        "%c[Image Repair Test] No attachment images found on this page.",
        "color: #ff5722",
      );
    } else {
      console.log(
        "%c[Image Repair Test] Retry triggered. Watch the toast for progress.",
        "color: #4CAF50",
      );
    }
  }, 800);

  // Optional: Show current metrics
  setTimeout(() => {
    if (
      window.__F95UE_IMAGE_REPAIR_ADDON__ &&
      typeof window.__F95UE_IMAGE_REPAIR_ADDON__.getMetrics === "function"
    ) {
      const metrics = window.__F95UE_IMAGE_REPAIR_ADDON__.getMetrics();
      console.table(metrics);
    }
  }, 2000);
})();
