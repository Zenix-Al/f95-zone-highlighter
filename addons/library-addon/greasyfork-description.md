### Requires F95Zone Ultimate Enhancer (core)

Install and enable the [F95Zone Ultimate Enhancer core script](https://greasyfork.org/scripts/546518-f95zone-ultimate-enhancer) first. Library is a core-managed add-on and will not run without it.

Core **v5.4.8 or newer** is recommended for full hybrid-update support, including cached tag and prefix mapping. Library **v1.5.0** adds no new core API requirement.

### F95UE Library Add-on

**Your personal F95Zone library — save threads, track your progress, and keep entries up to date.**

Save the current thread with one click, then organize everything through the built-in **Library Manager**.

**New in v1.5.0:** Browse your saved games directly on Latest with the **Library-only book toggle** beside Auto Refresh. Keep the site's familiar cards together with Latest Overlay tag highlights and your Library status markers, without opening the manager for every game.

### Features

- **Quick Save** — Save, update, or remove the current thread using optional page-dock controls.
- **Library Manager** — Search, filter, sort, pin, edit, and bulk-manage saved, playing, completed, or dropped entries.
- **Library-only Latest** — Use the book toggle beside Latest's Auto Refresh control to browse your saved collection through native cards, filters, and the existing Latest Overlay/status markers.
- **Personal Tracking** — Record your rating, last played version, progress notes, activity, and version history separately from the public thread rating.
- **Thread Status Chips** — See personal status, new-version, and disabled-update indicators beside saved thread titles.
- **Automatic Update Checks** — Check saved threads quietly in the background with configurable intervals, pacing, retry limits, and per-entry controls.
- **Manual Update Checks** — Check individual or selected entries and see whether each record is current, changed, unchecked, or failed.
- **Optional API-first Updates** — Enable **Prefer Latest API** to look up games through Latest listings, verify the saved thread ID, and fall back to thread HTML when a lookup cannot be used. Applies to both automatic and manual checks; off by default.
- **Update Diagnostics** — See hourly API usage, cooldowns, and the latest lookup source. **Copy diagnostics** includes the 20 most recent API/HTML errors, including API misses recovered by HTML, with title, developer, and search terms for troubleshooting.
- **Advanced Search** — Search current thread fields and combine filters such as `tag:"male protagonist"`, `status:playing`, `rating>=4`, `public-rating>=4`, `update:changed`, `pinned`, `has:note`, and `id:123456`.
- **Import and Export** — Back up and restore canonical Library data while retaining compatibility with older supported exports.
- **Core Tag Integration** — Display preferred, excluded, and marked tags using the colors configured in the core settings.
- **Guarded Legacy Upgrades** — Very old Library data must first be opened once with v1.2.2 from the Greasy Fork version history; unsupported direct upgrades stop without modifying stored records.

### Library-only Latest view

1. Save some game threads to your Library.
2. Open F95Zone's **Latest games** page and click the **book icon beside Auto Refresh**.
3. Browse your saved games using the native cards and controls. Click the book again to return to normal Latest.

On Latest's games page, select the **book icon immediately before Auto Refresh**.
This shows your saved Library records, not the forum's watched-thread list. Search,
tag/prefix filters, sorting, and pagination use the local collection. Toggle it off
to restore your previous normal Latest filters and page; the mode does not persist
across reloads.

Cards use stored facts, not a newly crawled Latest feed. Missing covers/screenshots
use placeholders until ordinary API checks supply them. A changed hint appears
after local edits or updater commits; cards reload on the next native redraw or
toggle instead of sending a request after every write. Existing status markers
continue to use the normal core integration.

Older records with missing metadata may not match every filter until refreshed.
Other background Latest API traffic shares core's capture; a native redraw or
toggle refreshes the overlay if those decorations become stale.

Each redraw still makes the site's ordinary list request. These browsing requests
are separate from the updater's own accounting below; this mode does not bypass
site limits or browser checks.
Local filtering does not hide the ordinary search/filter parameters sent in that
site request. Personal notes, ratings, and activity history are not uploaded.

### Update limits and site protection

- **Automatic daily limit:** defaults to 100 checks, configurable from **1 to 150**. There is no extra-batch bonus. Daily usage survives reloads and cycle restarts, and resets at local midnight.
- **Manual checks:** do not consume the automatic daily allowance, but still obey shared request pacing, API limits, and site cooldowns.
- **API allowance:** both check modes share **80 API attempts per clock hour** across tabs on the same origin/profile. Failed attempts count too. This is Library's own accounting, not a reading of F95's remaining server quota. When the allowance is exhausted, eligible checks use thread HTML instead.
- **Pacing:** at least **15 seconds** between requests, with optional jitter between records. An API lookup followed by HTML fallback counts as one automatic daily check, not two.
- **Site cooldowns:** an API challenge/rate limit temporarily suppresses API lookups while allowing paced HTML fallback. An HTML challenge/rate limit pauses both sources for at least 30 minutes. The add-on does not solve or bypass Cloudflare challenges.

Search coverage is not guaranteed. A missing API match does not mean a saved game is gone, and only a genuine version change marks an entry as a new unread update. Useful thread-fact changes can still be recorded in history, but new entries omit tag differences and presentation-only changes. Existing history is retained.

### Local data and privacy

Library records, personal activity, and update history are stored locally in IndexedDB. Update checks contact F95Zone; API-first searches send cleaned title and, when available, developer search terms to the site's Latest endpoint. Personal notes, ratings, and play history are not uploaded by Library.

Diagnostics are stored locally and shared only if you choose to copy and send them. Review them before sharing, since they can identify games in your collection.

Ideal for keeping track of a large collection without forgetting what you played, which version you reached, or what changed afterward.
