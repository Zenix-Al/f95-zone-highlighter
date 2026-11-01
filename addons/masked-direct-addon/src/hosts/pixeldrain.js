export async function processPixeldrainDownload({
  challengeGate,
  signal = challengeGate?.signal,
  debugLog,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const fileIdMatch = window.location.pathname.match(/^\/(?:u|d|f)\/([A-Za-z0-9_-]+)\/?$/);
  const fileId = fileIdMatch?.[1] || "";

  if (fileId) {
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    const directUrl = `${window.location.origin}/api/file/${encodeURIComponent(fileId)}?download`;
    debugLog("PixeldrainDownloader", "Attempting direct URL download.", {
      fileId,
    });

    console.info("[Pixeldrain] Checking if file is available via API...");

    // Probe the URL with a HEAD request to check if it's a valid download
    try {
      if (challengeGate && !(await challengeGate.waitUntilClear())) return;
      const headResponse = await fetch(directUrl, {
        method: "HEAD",
        ...(signal ? { signal } : {}),
      });
      signal?.throwIfAborted();
      const contentType = headResponse.headers?.get?.("content-type") || "";
      const disposition = headResponse.headers?.get?.("content-disposition") || "";

      console.info(
        "[Pixeldrain] HEAD response - status:",
        headResponse.status,
        "content-type:",
        contentType,
      );

      // If it's JSON, it's an error response
      if (contentType.includes("application/json")) {
        console.error("[Pixeldrain] API returned JSON (error), attempting to read error message");

        // Try to get full response with error message
        try {
          if (challengeGate && !(await challengeGate.waitUntilClear())) return;
          const fullResponse = await fetch(directUrl, signal ? { signal } : undefined);
          signal?.throwIfAborted();
          const jsonData = await fullResponse.json();
          const errorMsg = jsonData?.message || jsonData?.error || "Unknown error";
          console.error("[Pixeldrain] Host returned a file-unavailable response.");
          await notifyMainFailure("pixeldrain.com", "File unavailable: " + String(errorMsg));
        } catch (parseErr) {
          if (signal?.aborted) throw parseErr;
          console.error("[Pixeldrain] Could not parse error response:", parseErr);
          await notifyMainFailure("pixeldrain.com", "Server returned error instead of file");
        }
        return;
      }

      // Check for valid download response (should have attachment header or file content-type)
      if (
        !disposition.includes("attachment") &&
        !contentType.includes("application/octet-stream")
      ) {
        console.warn("[Pixeldrain] Response missing attachment header or wrong content-type");
        await notifyMainFailure(
          "pixeldrain.com",
          "File is not available for direct download (server rejected)",
        );
        return;
      }

      console.info("[Pixeldrain] File appears valid, proceeding with location.href");
    } catch (probeErr) {
      if (signal?.aborted) throw probeErr;
      console.error("[Pixeldrain] Error probing URL:", probeErr);
      // Continue anyway, might be a timeout
    }

    // Proceed with direct download via location.href
    debugLog("PixeldrainDownloader", "Triggering direct URL download.", {
      fileId,
    });
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    location.href = directUrl;
    reportAddonHealthy({ downloadTriggered: true });
    return;
  }

  await notifyMainFailure("pixeldrain.com", "Unsupported Pixeldrain file page.");
}

processPixeldrainDownload.definition = {
  id: "pixeldrain",
  canonicalHost: "pixeldrain.com",
  hostIncludes: ["pixeldrain.com"],
  text: "Pixeldrain",
  tooltip: "Enable direct download automation for pixeldrain.com",
  routes: [{ path: /^\/(?:u|d|f)\/[A-Za-z0-9_-]+\/?$/ }],

  mode: "custom",
  reason:
    "File-ID HEAD validation, optional JSON error-body request, and native download navigation with host-specific response semantics.",
};
