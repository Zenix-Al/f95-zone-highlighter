### F95UE Masked + Direct Download Add-on

Automates supported download-host pages and can skip the countdown on F95's new download page. Install [F95Zone Ultimate Enhancer](https://greasyfork.org/scripts/546518-f95zone-ultimate-enhancer) to configure the add-on and receive in-page feedback. Supported host automation runs independently of core.

### What changed in v1.3.0?

F95 changed its download links. The add-on now uses standalone host automation instead of managed downloads tied to an originating F95 tab.

- The old **Resolve** and **Direct DL** buttons, masked-link resolver and its CAPTCHA fallback are retired.
- Normal F95 download links remain untouched. On the new download page, the add-on can click **Continue** once, 250ms after its button is ready.
- The existing script name and saved settings identity are retained for updates.

### Features and settings

- **Skip the F95 download countdown:** enabled by default. Turn it off to leave the site's countdown alone. The intermediate F95 page never self-closes.
- **Automate supported host pages:** works regardless of where you opened the tab, including manually opened tabs. Saved automation and per-host choices apply.
- **Optional automatic closing:** attempts to close the host tab after a final download action and your configured delay. Default delay: 3.5 seconds; minimum: 3 seconds. Closing has its own off switch.
- **In-page feedback:** generic download-initiated, failure or verification messages can appear in a focused, visible F95 tab with core installed.

Automation and automatic closing default **on for new installations**. Existing saved automation choices are preserved. After upgrading from an older version, visit an ordinary F95 page with core enabled once to refresh saved preferences.

### Supported hosts

Buzzheavier/Bzzhr, Gofile, Google Drive, Pixeldrain, KrakenFiles, Datanodes, DelaFil, download.gg, Vik1ngFile/VikingFile, MediaFire, MixDrop, UploadHaven, UploadNow and Workupload.

### Limitations

- Support depends on the host's page type. **Pixeldrain `/l/` lists are not supported.** Folder/multiple-file pages automate only where a supported single-file check allows it; otherwise continue manually.
- Browsers may refuse to close a tab, especially one opened manually.
- A download action is **not proof that the file finished saving**. The add-on does not monitor the browser's download manager.
- Complete Cloudflare or other verification yourself; the add-on does not bypass it.
- Feedback is best-effort and is not replayed when you return to a hidden tab. No browser notification permission is requested, and messages contain no filenames or signed download URLs.
