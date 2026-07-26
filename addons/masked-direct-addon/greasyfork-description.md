### F95UE Masked + Direct Download Add-on

**Requires:** [F95Zone Ultimate Enhancer](https://greasyfork.org/scripts/546518-f95zone-ultimate-enhancer) (the core script)

**All-in-one masked-link skipper and smart direct-download handler.**

This add-on combines masked-link resolving and supported download-host
automation into one trusted package for F95UE.

### What it does

- **Thread pages:** Adds a clean **Resolve** button next to masked links without
  replacing their normal click behavior.
- **Masked pages:** Automatically skips `/masked/*` intermediary pages and
  includes a CAPTCHA fallback when verification is required.
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
  requirements back to the originating F95 tab.

### Features

- One-click masked-link resolution
- Automatic masked-page skipping with CAPTCHA fallback
- Host-specific direct-download automation
- Cloudflare challenge detection with safe pause and resume
- Parallel request isolation for downloads opened from multiple tabs
- Configurable managed download-tab closing
- Per-host enable and disable controls

The add-on respects the main script’s **Skip masked link** and
**Direct Download Links** settings, along with each supported host toggle.
