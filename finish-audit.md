# Finish Audit — Completed Work Log

Date: 2026-07-10

This file records the detailed changes made to complete part of the documentation audit so the main `audit.md` can remain minimal.

## Perubahan yang dilakukan

- Memperbarui `docs/features/creating-features.md` untuk menjelaskan alur discovery via generated manifest dan menghapus instruksi pengeditan manual `featureCatalog.js`.
- Memperbarui `docs/features/index.md` untuk menekankan bahwa fitur ditemukan oleh `scripts/featureManifest.cjs` dan tidak perlu didaftarkan secara manual.
- Menandai bagian audit terkait sebagai selesai agar agen/peninjau selanjutnya tidak mengulangi tindakan yang sama.
 - Menandai bagian audit terkait sebagai selesai agar agen/peninjau selanjutnya tidak mengulangi tindakan yang sama.
 - Menambahkan skrip `scripts/validate-manifest.js` dan `package.json` script `validate:manifest` untuk memvalidasi generated manifest (duplicate exports, duplicate ids, invalid bootstrapMode).

## Files modified in this change

- `docs/features/creating-features.md`
- `docs/features/index.md`
- `audit.md` (replaced detailed note with a "Selesai" marker pointing here)

## Langkah berikutnya (rekomendasi singkat)

1. Perbarui `docs/agent.md` dan `docs/architecture.md` untuk mencerminkan workflow manifest.
2. Tambahkan validasi manifest (skrip `scripts/validate-manifest.js` atau README tambahan pada `scripts/featureManifest.cjs`) untuk mendeteksi duplicate IDs, duplicate export names, atau bootstrap-mode yang tidak valid.
3. Sinkronkan daftar fitur di `docs/features` dari manifest yang ter-generate (script verifikasi atau tabel yang dihasilkan otomatis).
4. Tambahkan cek CI untuk memvalidasi generated-manifest drift pada pipeline (lint/test step).

Jika Anda ingin saya lanjutkan, pilih salah satu: a) perbarui `docs/agent.md` & `docs/architecture.md`, b) buat skrip validasi manifest, atau c) buat PR note dan siapkan perubahan untuk review.

---

## Moved actionable TODOs from `audit.md`

Date moved: 2026-07-10

The full list of framework hardening TODOs originally present in `audit.md` has been copied here so they can be triaged and assigned. The list is grouped by priority.

### Critical — Correctness and lifecycle

- Replace stale manual feature registration documentation with the generated manifest workflow.
- Add generated-manifest validation: fail tests/build when duplicate feature keys, duplicate IDs, invalid bootstrap modes, invalid page scopes, or stale generated output are detected.
- Define feature lifecycle cancellation semantics: timed-out, disabled, or route-stale lifecycle operations must not mutate state after cancellation.
- Pass an `AbortSignal` or transition generation token to asynchronous feature lifecycle operations.
- Define and test the global teardown contract: clarify whether teardown is permanently one-shot or supports reinitialization after BFCache/page restoration.
- Add integration tests covering enable → route change → disable → re-enable and pagehide/pageshow behavior.
- Make configuration import/migration atomic: validate and migrate into a temporary object before replacing active configuration.
- Add rollback/recovery behavior when configuration persistence or migration fails.

### High — Resource ownership and scheduling

- Namespace listener, observer, style, resource, and task IDs by owner feature/add-on.
- Treat registry ID collisions as framework-health errors in development/test mode instead of only warning or silently skipping.
- Expose registry snapshots for diagnostics and leak assertions.
- Assert that disabling a feature releases all listeners, observers, styles, timers, patches, and mounted nodes owned by that feature.
- Add task queue cancellation for the currently running asynchronous task.
- Add queue backpressure: configurable maximum size, overflow policy, and warning metrics.
- Add task timeout and idle/drain APIs for deterministic testing and teardown.
- Define whether duplicate task keys mean drop-old, drop-new, or replace-pending; document and test the chosen policy.

### High — Routing and bootstrap

- Introduce a shared route-transition epoch/generation across feature loading, observers, task queues, and service refreshes.
- Ensure stale asynchronous route work cannot apply DOM or state changes after navigation.
- Classify bootstrap steps as required, optional, or recoverable.
- Expose degraded startup state through feature health instead of only continuing silently after every bootstrap failure.
- Test rapid consecutive history/URL changes and repeated applicability transitions.
- Document and test the fast-bootstrap/config-readiness contract.

### High — Sync and persistence

- Add revision/version metadata to persisted settings updates.
- Define cross-tab conflict resolution and stale-write rejection.
- Test synchronization loop prevention and effect replay for every synchronized config section.
- Centralize configuration schema validation instead of maintaining defaults and import validation independently.
- Make migrations idempotent and test upgrades from every supported schema version.
- Add corrupted-storage recovery and optional last-known-good backup.

### High — Add-on security

- Write an explicit add-on threat model covering trusted, untrusted, disabled, and blocked states.
- Validate all bridge request payloads using action-specific schemas.
- Add protocol version, request ID, timeout, and replay/duplicate-response protection.
- Document and test HTML/style mount sanitization and cleanup ownership.
- Verify scope enforcement at action execution time, not only during registration.
- Redact sensitive data from add-on errors, logs, health reports, and bridge responses.
- Generate or validate add-on API documentation against the actual action registry.

### Medium — Observability and resilience

- Standardize framework error codes and structured health events.
- Add correlation IDs for bootstrap, route transition, feature transition, and add-on requests.
- Add registry and queue state to the feature-health report.
- Deduplicate repeated errors and cap logs by both count and approximate memory.
- Add selector-failure diagnostics and fallback-selector policy.
- Add fast-capture payload validation, size limits, TTL, and memory limits.
- Verify that fetch/XHR patches are reversible and safe across repeated initialization.
- Document direct global listeners that intentionally live for the full userscript session.

### Testing and automation

- Add CI for lint, tests, `git diff --check`, and generated-manifest drift.
- Add a Markdown link checker and documentation path checker.
- Add a script comparing documented features/services with source inventories.
- Add DOM integration tests for routing, lifecycle, teardown, registries, and add-on bridge behavior.
- Add failure-path tests, not only successful initialization tests.
- Add a build-script smoke test to catch stale package scripts.

---

If you want these broken into smaller tasks with owners and links to relevant files, I can prepare a PR with suggested task assignments and references.
