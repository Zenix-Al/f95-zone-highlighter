## 🎯 **Improvement Roadmap for the Source**

Since the dev has modular source files, here's what to tackle (in priority order):

---

## **TIER 1: High Impact, Medium Effort**

### 1. **Eliminate Global State Coupling (Completed)**

**Current Problem:**

```javascript
// In src/features/latest-overlay/latest-overlay.js
var tileQueue = null;
var generationCounter = 0;

// In src/features/image-repair/handler.js
var imageQueue = null;

// In src/config.js
var state = {
  /* 20+ properties */
};
var config = {
  /* mutable everywhere */
};
```

**What to do:**

- Create a `StateManager` module
- Use getters/setters instead of direct mutation
- Namespace features properly

```javascript
// src/core/StateManager.js
const createStateManager = () => {
  let state = {
    /* ... */
  };

  return {
    get: (path) => getByPath(state, path),
    set: (path, value) => setByPath(state, path, value),
    subscribe: (path, callback) => {
      /* watch changes */
    },
  };
};

const stateManager = createStateManager();
// Usage: stateManager.set('latestOverlay.status', 'ACTIVE');
```

**Impact:** Prevents accidental state mutations, easier debugging

---

### 2. **Create Feature Module Interface(Completed)**

**Current Problem:**

```javascript
// Inconsistent patterns across features
function enableLatestOverlay() {
  /* ... */
}
function disableLatestOverlay() {
  /* ... */
}

function toggleImageRepair() {
  /* ... */
} // No separate enable/disable

function toggleNoticeDismissal() {
  /* ... */
}
function enableNoticeDismissal() {
  /* ... */
}
function disableNoticeDismissal() {
  /* ... */
}
```

**What to do:**

```javascript
// src/core/featureFactory.js
const createFeature = (name, { enable, disable, config }) => ({
  name,
  enable: () => {
    debugLog(name, "Enabling...");
    enable();
  },
  disable: () => {
    debugLog(name, "Disabling...");
    disable();
  },
  toggle: (shouldEnable) => (shouldEnable ? this.enable() : this.disable()),
  isEnabled: () => config.get("enabled"),
});

// Usage in src/features/image-repair/index.js
export const imageRepairFeature = createFeature("Image Repair", {
  enable: () => enableImageRepair(),
  disable: () => disableImageRepair(),
  config: configManager.getSection("threadSettings.imgRetry"),
});
```

**Impact:** Consistent feature lifecycle, easier to test

---

### 3. **Cleanup Management System (completed)**

**Current Problem:**

```javascript
// Listeners leak on repeated toggles
addListener("tags-search-input", searchInput, "input", updateSearch);
// Later...
// But if modal is closed/reopened, listener stays

// Observers don't always disconnect properly
addObserverCallback("latest-overlay", processMutations3);
// What if feature toggled 10 times?
```

**What to do:**

```javascript
// src/core/ResourceManager.js
class ResourceManager {
  constructor() {
    this.resources = new Map();
  }

  register(id, cleanup) {
    if (this.resources.has(id)) {
      console.warn(`Resource ${id} already registered`);
    }
    this.resources.set(id, { cleanup, createdAt: Date.now() });
  }

  cleanup(id) {
    const resource = this.resources.get(id);
    if (!resource) return;
    resource.cleanup();
    this.resources.delete(id);
  }

  cleanupAll(pattern) {
    // Clean by prefix: cleanupAll('latest-*')
    for (const [id] of this.resources) {
      if (this.matchesPattern(id, pattern)) {
        this.cleanup(id);
      }
    }
  }
}

// Usage
resourceManager.register("latest-overlay-observer", () => {
  observer.disconnect();
});

// Later, when disabling overlay:
resourceManager.cleanup("latest-overlay-observer");
```

**Impact:** Zero memory leaks, cleaner teardown

**Implementation note (recent):**

- A `ResourceManager` singleton was added (`src/core/resourceManager.js`) and integrated with the shared listener (`src/core/listenerRegistry.js`) and observer (`src/core/observer.js`) registries. Several high-risk features were registered with the manager for safe cleanup (see changelog for details).

**Completed work moved:** Completed implementation notes and task details were moved to `changelog-4.5.34.md` for historical record.

### 3.a **Feature Health Checks (Completed)**

Add lightweight health checks for features so the system can report whether a feature is `running`, `disabled`, or `failing`.

What to do:

- Implement `src/core/featureHealth.js` with a small API:

```javascript
// Example API
export function setFeatureStatus(id, status, details) {
  // status = 'running' | 'disabled' | 'failing'
}

export function getFeatureStatus(id) {
  // returns { status, lastUpdated, details }
}

export function getAllFeatureStatuses() {
  /* ... */
}
```

- Instrument feature enable/disable paths to call `setFeatureStatus(featureId, 'running')` and on failures set `'failing'` with an error message.
- Expose a simple UI hook or developer console command to `getAllFeatureStatuses()` so maintainers can quickly check which features are active, disabled, or in error state.
- Optionally report failures to `metricsService` so recurring failures can be tracked.

Impact: Quick detection of misbehaving features and easier debugging during toggles and SPA navigation.

---

## **TIER 2: Medium Impact, Low Effort**

### 4. **Validate & Sanitize DOM Operations (Completed)**

**Current Problem:**

```javascript
const body = tile.querySelector(".resource-tile_body");
if (!body) return;
// But other places don't check
tile.dataset.modified = "true"; // Assumes tile exists
```

- **Implementation:** Added a lightweight helper module at `src/utils/domSafe.js` exporting `safeQuery`, `safeQueryAll`, `safeSetDataset`, `safeAssignStyle`, and `safeText` to centralize safe DOM access and mutation.

**What to do:**

```javascript
// src/utils/domSafe.js
const safeSel = (parent, selector) => {
  try {
    const el = parent?.querySelector?.(selector);
    if (!el) throw new Error(`Selector not found: ${selector}`);
    return el;
  } catch (err) {
    debugLog("DOM", `Safe selector failed: ${err.message}`, { level: "warn" });
    return null;
  }
};

// Usage
const body = safeSel(tile, ".resource-tile_body");
if (!body) return; // Clear contract
```

**Impact:** Fewer silent failures, easier debugging

---

### 5. **Extract Magic Numbers to Constants**

**Current Problem:**

```javascript
const timeoutMS = 8e3;
const TOAST_DURATION = 2e3;

// But scattered through code:
await waitFor(() => tile.querySelector(".resource-tile_body"), 50, 1500);
//                                                              ↑   ↑
//                                                        interval timeout
setTimeout(() => {
  removeToast();
}, 6e3); // Where does 6 seconds come from?
```

**What to do:**

```javascript
// src/config/timings.js
export const TIMINGS = {
  TILE_POPULATE_CHECK_INTERVAL: 50, // ms between DOM checks
  TILE_POPULATE_TIMEOUT: 1500, // max wait for tile content
  TOAST_DISPLAY: 2000, // toast visibility
  DOWNLOAD_TIMEOUT: 8000, // download attempt timeout
  GOFILE_AUTO_CLOSE: 6000, // auto-close gofile tab delay
  IMAGE_RETRY_DELAY: 4000,
  IMAGE_RETRY_MAX_ATTEMPTS: 10,
};

// Usage
await waitFor(
  () => tile.querySelector(".resource-tile_body"),
  TIMINGS.TILE_POPULATE_CHECK_INTERVAL,
  TIMINGS.TILE_POPULATE_TIMEOUT,
);
```

**Impact:** Single source of truth, easier tuning

- **Implementation:** Added `src/config/timings.js` exporting `TIMINGS` (see file for constants). Next step: replace scattered numeric literals with `TIMINGS.*` usages across modules.

---

### 6. **Create Selector Constants (Completed)**

**Current Problem:**

```javascript
// Scattered across code
tile.querySelector(".resource-tile_body");
tile.querySelector(".resource-tile_label-version");
document.querySelector(".js-tagList");
document.querySelector(".selectize-input.items.not-full");

// If F95Zone changes, edit multiple files
```

**What to do:**

```javascript
// src/config/selectors.js
export const SELECTORS = {
  TILE: {
    BODY: ".resource-tile_body",
    THUMB_WRAP: ".resource-tile_thumb-wrap",
    LABEL_VERSION: ".resource-tile_label-version",
    LABEL_WRAP: ".resource-tile_label-wrap_right",
    INFO_META: ".resource-tile_info-meta",
  },
  THREAD: {
    TAG_LIST: ".js-tagList",
    TAG_ITEM: ".tagItem",
  },
  TAG_PICKER: {
    INPUT: ".selectize-input.items.not-full",
    DROPDOWN: ".selectize-dropdown.single.filter-tags-select",
  },
};

// Usage
const body = tile.querySelector(SELECTORS.TILE.BODY);
```

**Impact:** Single edit point if F95Zone HTML changes

- **Implementation:** Added `src/config/selectors.js` exporting `SELECTORS` (see file). Replaced several high-risk selector literals with constants in `src/features/latest-overlay/handler.js`, `src/services/tagsService.js`, and `src/features/direct-download/gofile.js`.

---

## **TIER 3: Low Impact, Quick Wins**

### 7. **Type Guards for Config**

**Current Problem:**

```javascript
if (config.overlaySettings.excluded && excludedTag) {
  // excludedTag could be false, "", or a string
  // Is it safe to push?
}
```

**What to do:**

```javascript
// src/utils/validators.js
const isValidTag = (tag) => typeof tag === "string" && tag.length > 0;
const isValidColor = (hex) => /^#[0-9a-f]{6}$/i.test(hex);
const isValidVersion = (v) => typeof v === "number" && v >= 0;

// Usage
if (config.overlaySettings.excluded && isValidTag(excludedTag)) {
  colors.push(config.color.excluded);
}
```

**Impact:** Catches edge cases early

- **Implementation:** Added `src/utils/validators.js` exporting `isValidTag`, `isValidColor`, `isValidVersion`, and `isPositiveInteger`. Updated `src/features/latest-overlay/handler.js` to use `isValidTag` when checking extracted tag names before using them.

---

### 8. **Extract Repeated Patterns to Helpers(Completed)**

**Current Problem:**

```javascript
// In multiple places
img.dataset.originalSrc = img.dataset.originalSrc || img.src;

// In multiple places
Object.assign(ctx.el.style, {
  color: colorState.SUCCESS.color,
  fontWeight: "bold",
  textDecoration: "none",
});

// In multiple places
showToast(`${feature} ${v ? "enabled" : "disabled"}`);
```

**What to do:**

```javascript
// src/utils/helpers.js
const preserveOriginalSrc = (img) => {
  img.dataset.originalSrc ||= img.src;
};

const styleDownloadSuccess = (el) => {
  Object.assign(el.style, {
    color: colorState.SUCCESS.color,
    fontWeight: "bold",
    textDecoration: "none",
  });
};

const toastToggle = (name, enabled) => showToast(`${name} ${enabled ? "enabled" : "disabled"}`);
```

**Impact:** DRY principle, less copy-paste bugs

---

### 9. **Better Error Messages**

**Current Problem:**

```javascript
debugLog("Tag Update", `An error occurred during tag update: ${error}`);
// What error? What went wrong? How to fix?
```

**What to do:**

```javascript
// src/utils/errorReporting.js
const reportError = (context, error, suggestions = []) => {
  debugLog(context, `Error: ${error.message}`, { level: "error" });
  if (error.stack) debugLog(context, error.stack, { level: "error" });
  if (suggestions.length) {
    debugLog(context, `Suggestions:\n${suggestions.join("\n")}`);
  }
};

// Usage
reportError("Tag Update", error, [
  "Try refreshing the page",
  "Check if F95Zone API changed",
  "Verify GM permissions are granted",
]);
```

**Impact:** Faster debugging for users

---

## **TIER 4: Technical Debt Cleanup**

### 10. **Async Chain Simplification**

**Current Problem:**

```javascript
updateTags().then((result) => {
  if (result?.pruned && result.count > 0) {
    showToast(`${result.count} obsolete tag(s) removed from your lists.`);
  }
  renderPreferred(); // Why are these here and not in updateTags?
  renderExcluded();
  checkTags();
});
```

**What to do:**

```javascript
// Use async/await clearly
async function initializeModalUI() {
  await initModalUi();

  const result = await updateTags();
  if (result?.pruned && result.count > 0) {
    showToast(`${result.count} obsolete tag(s) removed`);
  }

  // Render after update completes
  renderPreferred();
  renderExcluded();
  checkTags();
}
```

**Impact:** Clearer execution flow, easier to follow logic

---

## **Quick Summary Table**

| Priority | Issue                          | Fix                 | Time  | Impact |
| -------- | ------------------------------ | ------------------- | ----- | ------ |
| 🔴 P1    | Global state mutations         | StateManager        | 2-3h  | High   |
| 🔴 P1    | Inconsistent feature interface | Feature factory     | 1-2h  | High   |
| 🔴 P1    | Memory leaks on toggles        | ResourceManager     | 2-3h  | High   |
| 🟠 P2    | DOM selector brittleness       | SafeSel + Constants | 1-2h  | Med    |
| 🟠 P2    | Magic numbers scattered        | Timings.js          | 30min | Med    |
| 🟡 P3    | Type validation missing        | Validators          | 1h    | Low    |
| 🟡 P3    | Copy-paste helpers             | Extract helpers     | 1h    | Low    |
| ⚪ P4    | Error messages vague           | Better logging      | 30min | Low    |

---
