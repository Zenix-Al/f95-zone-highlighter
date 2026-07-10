# Fast Capture Service (`fastCapture`)

The **Fast Capture** service (`src/services/fastCapture/`) is a performance optimization utility that intercepts and caches AJAX (XHR/Fetch) network responses early in the page load lifecycle—specifically before the DOM is parsed or the main script features are fully instantiated.

---

## Why Use Fast Capture?
In single-page-like dynamic forums, page data is loaded via asynchronous API calls during the document's early load stages. If a feature has to wait for the body to boot, then make its own request to fetch that exact same data, the user experiences significant layout delay and double network usage.

Fast Capture intercepts the website's native calls and stores the payloads in-memory. When your feature is enabled, the data is already waiting in the `fastCaptureStore`, avoiding redundant HTTP requests.

---

## Configuring Fast Capture in a Feature

To use Fast Capture, the feature must boot in `"fast"` mode. You configure it by passing a `fastCapture` object to `createFeature` or `createStyledFeature`:

```javascript
// src/features/latest-overlay/index.js
export const latestOverlayFeature = createStyledFeature("Latest Overlay", {
  id: "latest-raw-capture",
  configPath: "latestSettings.latestOverlayToggle",
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  bootstrapMode: "fast", // Required for early interception
  fastCapture: {
    urlIncludes: "latest_data.php", // URL string to match
    dataPath: "msg.data",           // JSON property path where target data resides
    transport: "any",               // "xhr", "fetch", or "any"
    mode: "latest",                 // "latest", "oncePerRoute", or "oncePerDocument"
    ttlMs: 30000,                   // Cache time-to-live
  },
  styleCss: featureCss,
  enable: runEnableLatestOverlay,
  disable: runDisableLatestOverlay,
});
```

### Configuration Options
- **`urlIncludes`**: *(String | Array)* One or more URL substrings to match against.
- **`dataPath`**: *(String)* The dot-notated path inside the JSON response to capture (uses `utils/objectPath.js`).
- **`transport`**: *(String)* `'xhr'`, `'fetch'`, or `'any'` (default).
- **`mode`**: *(String)*
  - `'latest'`: Always capture and overwrite with the newest response.
  - `'oncePerRoute'`: Intercept once per client-side route change.
  - `'oncePerDocument'`: Intercept once per full page load.
- **`ttlMs`**: *(Number)* Expiration lifetime of the captured snapshot in milliseconds. It defaults to 30 seconds and is capped at that value.

## Ownership and limits

`src/services/fastCapture/index.js` is the public facade for both consumers and
bootstrap orchestration. `rules.js` owns feature-rule normalization,
`pageCaptureTransport.js` and `sandboxCaptureTransport.js` own interception,
`captureQueue.js` owns frame-budgeted queued processing, and
`fastCaptureStore.js` owns snapshots and subscriber notification.

The service accepts same-origin HTTP(S) XHR/fetch responses only. It rejects
malformed URLs, unsupported response types, stale-route work, and payloads over
512 KiB before parsing. The queue accepts at most 20 pending items; retained
snapshots are capped at 2 MiB and oldest snapshots are evicted first. Diagnostics
expose only counts, byte totals, ages, drop reasons, and queue state—never bodies.

---

## Consuming Captured Data in Feature Logic

Import consumer helpers from the fast-capture service facade:

```javascript
import { 
  getFastCaptureSnapshot, 
  subscribeFastCapture, 
  hasFastCaptureData 
} from "../../services/fastCapture/index.js";
```

### API Reference
- **`hasFastCaptureData(featureKey)`**: Returns a `boolean` indicating if a valid snapshot is available.
- **`getFastCaptureData(featureKey)`**: Returns the extracted raw data payload.
- **`getFastCaptureSnapshot(featureKey)`**: Returns the full wrapper snapshot object:
  ```javascript
  {
    status: "captured" | "pending" | "error",
    data: [...],           // Extracted data
    sourceUrl: "...",      // Intercepted URL
    capturedAt: 172000..., // Timestamp
    errorMessage: null     // Present if status is "error"
  }
  ```
- **`subscribeFastCapture(featureKey, callback)`**: Subscribes to updates. The callback is invoked as soon as a response is captured. Returns an unsubscribe function.

### Real-World Usage Pattern
```javascript
// src/features/latest-overlay/handler.js
let unsubscribeLatestData = null;

export function enableLatestOverlay() {
  // 1. Subscribe to upcoming network captures
  unsubscribeLatestData = subscribeFastCapture("latest-raw-capture", (snapshot) => {
    if (snapshot.status === "captured") {
      renderOverlayTiles(snapshot.data);
    } else if (snapshot.status === "error") {
      showErrorPlaceholder(snapshot.errorMessage);
    }
  });

  // 2. Proactively check if the response was already captured before enabling
  const currentSnapshot = getFastCaptureSnapshot("latest-raw-capture");
  if (currentSnapshot.status === "captured") {
    renderOverlayTiles(currentSnapshot.data);
  }
}

export function disableLatestOverlay() {
  if (unsubscribeLatestData) {
    unsubscribeLatestData();
    unsubscribeLatestData = null;
  }
}
```

---

## How It Works Under the Hood

1. **Interception**:
   - **`pageCaptureTransport.js`**: Patches the page's global `window.fetch` and `window.XMLHttpRequest` prototypes when running in the page context.
   - **`sandboxCaptureTransport.js`**: Fallback interception for sandbox contexts.
2. **Buffering**: Captured payloads are queued (`captureQueue.js`) and parsed asynchronously to avoid blocking the main thread.
3. **Performance Recovery Cache**:
   - If an API request completed before the userscript started executing, Fast Capture tries to recover it by querying the browser's HTTP resource cache via the **Performance API** (`PerformanceObserver`).
   - If a matching request is found in the resource timeline, Fast Capture silently re-fetches it via `fetch(..., { credentials: "same-origin" })` to populate the store.
