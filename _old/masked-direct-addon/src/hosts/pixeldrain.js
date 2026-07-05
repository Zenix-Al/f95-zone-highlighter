import { clickElement } from "./shared/dom.js";

export async function processPixeldrainDownload({
  debugLog,
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const fileIdMatch = window.location.pathname.match(
    /\/(?:u|d|f)\/([A-Za-z0-9_-]+)/,
  );
  const fileId = fileIdMatch?.[1] || "";

  if (fileId) {
    const directUrl = `${window.location.origin}/api/file/${encodeURIComponent(fileId)}?download`;
    debugLog("PixeldrainDownloader", "Attempting direct URL download.", {
      fileId,
      directUrl,
    });

    console.info("[Pixeldrain] Checking if file is available via API...");

    // Probe the URL with a HEAD request to check if it's a valid download
    try {
      const headResponse = await fetch(directUrl, { method: "HEAD" });
      const contentType = headResponse.headers?.get?.("content-type") || "";
      const disposition =
        headResponse.headers?.get?.("content-disposition") || "";

      console.info(
        "[Pixeldrain] HEAD response - status:",
        headResponse.status,
        "content-type:",
        contentType,
      );

      // If it's JSON, it's an error response
      if (contentType.includes("application/json")) {
        console.error(
          "[Pixeldrain] API returned JSON (error), attempting to read error message",
        );

        // Try to get full response with error message
        try {
          const fullResponse = await fetch(directUrl);
          const jsonData = await fullResponse.json();
          const errorMsg =
            jsonData?.message || jsonData?.error || "Unknown error";
          console.error("[Pixeldrain] Server error message:", errorMsg);
          showToast("Pixeldrain: " + String(errorMsg), 5000);
          await notifyMainFailure(
            "pixeldrain.com",
            "File unavailable: " + String(errorMsg),
          );
        } catch (parseErr) {
          console.error(
            "[Pixeldrain] Could not parse error response:",
            parseErr,
          );
          showToast("Pixeldrain: Server returned an error", 5000);
          await notifyMainFailure(
            "pixeldrain.com",
            "Server returned error instead of file",
          );
        }
        return;
      }

      // Check for valid download response (should have attachment header or file content-type)
      if (
        !disposition.includes("attachment") &&
        !contentType.includes("application/octet-stream")
      ) {
        console.warn(
          "[Pixeldrain] Response missing attachment header or wrong content-type",
        );
        await notifyMainFailure(
          "pixeldrain.com",
          "File is not available for direct download (server rejected)",
        );
        return;
      }

      console.info(
        "[Pixeldrain] File appears valid, proceeding with location.href",
      );
    } catch (probeErr) {
      console.error("[Pixeldrain] Error probing URL:", probeErr);
      // Continue anyway, might be a timeout
    }

    // Proceed with direct download via location.href
    debugLog("PixeldrainDownloader", "Triggering direct URL download.", {
      fileId,
      directUrl,
    });
    location.href = directUrl;
    reportAddonHealthy();
    return;
  }

  console.info(
    "[Pixeldrain] No file ID in URL, attempting fallback button click",
  );
  const fallbackButton = document.querySelector("button.button_highlight");
  if (!fallbackButton) {
    console.error("[Pixeldrain] Fallback button not found");
    await notifyMainFailure("pixeldrain.com", "No download button found.");
    return;
  }

  console.info("[Pixeldrain] Clicking fallback download button");
  if (!clickElement(fallbackButton)) {
    await notifyMainFailure(
      "pixeldrain.com",
      "Unable to trigger download button.",
    );
    return;
  }
  showToast("Pixeldrain download triggered.");
  reportAddonHealthy();
}
