### F95UE Masked + Direct Download Add-on

**Recommended:** [F95Zone Ultimate Enhancer](https://greasyfork.org/scripts/546518-f95zone-ultimate-enhancer) (the core script)

**All-in-one masked-link skipper and smart direct-download handler.**

This add-on combines masked-link resolving and supported download-host
automation into one trusted package for F95UE. It can also run without core
with deliberately limited standalone capabilities.

Core remains recommended for thread-page controls, managed downloads,
notifications, and the complete settings experience.

### What it does

- **Thread pages:** Adds a clean **Resolve** button next to masked links without
  replacing their normal click behavior. This button requires F95UE core.
- **Masked pages:** Automatically skips `/masked/*` intermediary pages and
  includes a CAPTCHA fallback. A limited local fallback works without core.
- **Supported downloads:**
  - Buzzheavier / Bzzhr
  - Gofile
  - Google Drive
  - KrakenFiles
  - MixDrop
  - UploadHaven
  - UploadNow
  - Pixeldrain
  - Datanodes
  - DelaFil
  - download.gg
  - Vik1ngFile / VikingFile
  - MediaFire
  - Workupload
- **Attention notices:** Reports failures, verification steps, and manual-action
  requirements to the originating F95 tab when running with core.

### Features

- One-click masked-link resolution with core
- Automatic masked-page skipping with CAPTCHA fallback
- Host-specific direct-download automation
- Cloudflare challenge detection with safe pause and resume
- Parallel request isolation for downloads opened from multiple tabs
- Configurable managed download-tab closing
- Per-host enable and disable controls

### Limited standalone mode

Without F95UE core, the add-on can:

- skip supported `/masked/*` intermediary pages using normal navigation;
- automate only narrowly approved download-host routes when standalone policy
  permits it; and
- preserve safe host checks and duplicate-action guards.

Standalone mode does **not** add Resolve buttons to thread pages, recreate the
core observer, send notifications to an origin tab, create managed download
requests, or automatically close managed tabs.

With core installed, the add-on respects the main script's **Skip masked link**
and **Direct Download Links** settings, along with each supported host toggle.
