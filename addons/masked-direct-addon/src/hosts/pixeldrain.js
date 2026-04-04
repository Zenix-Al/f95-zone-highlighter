export async function processPixeldrainDownload({
  debugLog,
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const fileIdMatch = window.location.pathname.match(/\/(?:u|d|f)\/([A-Za-z0-9_-]+)/);
  const fileId = fileIdMatch?.[1] || "";

  if (fileId) {
    const directUrl = `${window.location.origin}/api/file/${encodeURIComponent(fileId)}?download`;
    debugLog("PixeldrainDownloader", "Triggering direct URL download.", { fileId, directUrl });
    location.href = directUrl;
    reportAddonHealthy();
    return;
  }

  const fallbackButton = document.querySelector("button.button_highlight");
  if (!fallbackButton) {
    await notifyMainFailure("pixeldrain.com", "No download button found.");
    return;
  }

  fallbackButton.click();
  showToast("Pixeldrain download triggered.");
  reportAddonHealthy();
}
