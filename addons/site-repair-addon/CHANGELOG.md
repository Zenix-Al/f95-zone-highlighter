# Changelog

## v0.2.6 - Rebrand as F95UE Site Repair

- Preserve the Image Repair userscript namespace and GreasyFork listing identity.
- Canonicalize runtime/state identity to `site-repair-addon` with `image-repair-addon` as a legacy ID.
- Move Latest Ajax Recovery from core into an independently controlled, Latest-only repair with one bounded retry and reversible jQuery restoration.
- Start the add-on repair from its own default instead of importing the unreleased core preference.
