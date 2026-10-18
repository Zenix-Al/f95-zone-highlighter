### Requires F95Zone Ultimate Enhancer (core)

Install and enable the [F95Zone Ultimate Enhancer core script](https://greasyfork.org/scripts/546518-f95zone-ultimate-enhancer) first. Library is a core-managed add-on and will not run without it.

For Library **v1.4.0**, update core to **v5.4.8 or newer** for full hybrid-update support, including cached tag and prefix mapping.

### F95UE Library Add-on

**Your personal F95Zone library — save threads, track your progress, and keep entries up to date.**

Save the current thread with one click, then organize everything through the built-in **Library Manager**.

### Features

- **Quick Save** — Save, update, or remove the current thread using optional page-dock controls.
- **Library Manager** — Search, filter, sort, pin, edit, and bulk-manage saved, playing, completed, or dropped entries.
- **Personal Tracking** — Record your rating, last played version, progress notes, activity, and version history separately from the public thread rating.
- **Thread Status Chips** — See personal status, new-version, and disabled-update indicators beside saved thread titles.
- **Automatic Update Checks** — Check saved threads quietly in the background with configurable intervals, pacing, retry limits, and per-entry controls.
- **Manual Update Checks** — Check individual or selected entries and see whether each record is current, changed, unchecked, or failed.
- **Optional API-first Updates** — Enable **Prefer Latest API** to look up games through Latest listings, verify the saved thread ID, and fall back to thread HTML when a lookup cannot be used. Applies to both automatic and manual checks; off by default.
- **Update Diagnostics** — See hourly API usage, cooldowns, and the latest lookup source. **Copy diagnostics** includes the 20 most recent API/HTML errors, including API misses recovered by HTML, with title, developer, and search terms for troubleshooting.
- **Activity Indicators** — Green while updating, yellow during an active site cooldown, and red for updater-level failures. Ordinary waits, manual pauses, and completed cycles stay neutral.
- **Advanced Search** — Search current thread fields and combine filters such as `tag:"male protagonist"`, `status:playing`, `rating>=4`, `public-rating>=4`, `update:changed`, `pinned`, `has:note`, and `id:123456`.
- **Import and Export** — Back up and restore canonical Library data while retaining compatibility with older supported exports.
- **Core Tag Integration** — Display preferred, excluded, and marked tags using the colors configured in the core settings.
- **Guarded Legacy Upgrades** — Very old Library data must first be opened once with v1.2.2 from the Greasy Fork version history; unsupported direct upgrades stop without modifying stored records.

### Update limits and site protection

- **Automatic daily limit:** defaults to 100 checks, configurable from **1 to 150**. There is no extra-batch bonus. Daily usage survives reloads and cycle restarts, and resets at local midnight.
- **Manual checks:** do not consume the automatic daily allowance, but still obey shared request pacing, API limits, and site cooldowns.
- **API allowance:** both check modes share **80 API attempts per clock hour** across tabs on the same origin/profile. Failed attempts count too. This is Library's own accounting, not a reading of F95's remaining server quota. When the allowance is exhausted, eligible checks use thread HTML instead.
- **Pacing:** at least **15 seconds** between requests, with optional jitter between records. An API lookup followed by HTML fallback counts as one automatic daily check, not two.
- **Site cooldowns:** an API challenge/rate limit temporarily suppresses API lookups while allowing paced HTML fallback. An HTML challenge/rate limit pauses both sources for at least 30 minutes. The add-on does not solve or bypass Cloudflare challenges.

Search coverage is not guaranteed. A missing API match does not mean a saved game is gone, and only a genuine version change marks an entry as a new unread update. Title and other metadata changes can still be recorded in history.

### Local data and privacy

Library records, personal activity, and update history are stored locally in IndexedDB. Update checks contact F95Zone; API-first searches send cleaned title and, when available, developer search terms to the site's Latest endpoint. Personal notes, ratings, and play history are not uploaded by Library.

Diagnostics are stored locally and shared only if you choose to copy and send them. Review them before sharing, since they can identify games in your collection.

Ideal for keeping track of a large collection without forgetting what you played, which version you reached, or what changed afterward.
