# Changelog

## [2026-10-17 - Library 1.3.11]

- Released Library 1.3.11 with a 10-second minimum automatic request spacing,
  persistent daily allowance across cycles, owner-aware recovery reporting,
  and first-time Played this version recording.
- Added working/waiting/error activity rings. Core 5.4.7 provides dock styling;
  the Library Manager styles its own Auto update button.
- Reload open F95 tabs after updating so older workers stop using old accounting.

## [2026-10-11 - Shared readiness patch releases]

- Released Library 1.3.10, Latest Filters 1.1.3, Halloween Theme 1.0.3,
  Example 1.0.6, Thread Utility 1.0.4, Site Repair 1.0.5, and Masked + Direct 1.2.4.
- Unified core readiness polling while preserving Site Repair's early shield and
  Masked + Direct's access fallback and external-host behavior.
- Fixed build-cache invalidation to include imported shared dependencies and build
  transforms. Shared-only changes now rebuild affected add-ons automatically.
- Added regression tests and refreshed CI audit reports.

## [Unreleased - Add-on hardening and runtime cleanup]

- Finished the planned add-on metadata, trust, lifecycle, identity, API, service, runtime, Site Repair, and integration work recorded in `TODO_ADDONS_DETAILED.md`.
- Completed the final add-on service and userscript size audit, preserving existing add-on flows and release metadata without changing add-on versions.
