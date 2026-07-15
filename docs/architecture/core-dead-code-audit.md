# Core dead-code audit

This note records the evidence for `CORE-DEAD-CODE-01`. The audit is limited to the
non-add-on core scope. The latest `core-source-audit` report identified candidates by
static import fan-in and unreferenced exports; those hints were checked against generated
feature registration, string/event access, settings metadata, DOM selectors, and
userscript globals before deletion.

## Deletions with evidence

### Unreachable audio and sound subsystem

Deleted:

- `src/features/audio/index.js`
- `src/core/sound/index.js`
- `src/core/sound/instrument.js`
- `src/core/sound/instrumentBank.js`

Evidence:

- `src/features/audio/index.js` had `fanIn: 0` and was listed in `orphanFiles`; it did
  not export a `*Feature` value and had no entry in
  `src/generated/features.generated.js`.
- The only static source import of `src/core/sound/index.js` was the deleted audio
  helper. The only static source import of `src/core/sound/instrument.js` was the
  deleted sound entry point. `instrumentBank.js` had `fanIn: 0` and no caller.
- Repository-wide searches found no callers, tests, documentation, generated manifest
  entry, string action ID, event name, settings metadata path, selector, or userscript
  global for the deleted audio exports or sound modules. The `window.__f95_audio_ctx`
  reference existed only inside the deleted unreachable sound entry point.
- The modules were not release bundle contributors in the latest audit. Their removal
  therefore reduces authored source only; bundle behavior is unchanged.

## Candidates retained

- `src/services/notificationService.js` remains because `_old/direct-download/index.js`
  imports `notify`. Its current-core fan-in is zero, but the repository-wide caller
  fails the deletion gate.
- `src/features/latest-control/index.js`, `src/features/dismiss-notification/index.js`,
  `src/features/signature-collapse/index.js`, `src/features/wide-latest/index.js`, and
  `src/features/wideForum/index.js` remain because the generated feature manifest
  imports their feature exports.
- `src/core/pageDetection.js`, `src/core/pageLifecycle.js`, `src/core/teardown.js`,
  `src/core/featureScope.js`, and `src/ui/index.js` remain because bootstrap, loader, or
  main entry-point imports are valid entry reachability even when the audit graph marks
  the file as an orphan.
- Unreferenced-export hints in test-facing diagnostics, settings schema APIs, health
  diagnostics, and transfer/config contracts were retained because tests, documented
  contracts, or runtime entry points use them. No helper consolidation was performed.

## Other audit groups

- Unused export: no deletion met all three evidence gates.
- Compatibility re-export: none found in the audited core scope.
- Duplicate pure helper: none deleted; no safe duplicate was proven without speculative
  consolidation.
- Stale generated-manifest reference: none found after removing the unregistered audio
  helper.
- Dead CSS/HTML identifier: not changed; selector and asset cleanup belongs to
  `CORE-UI-ASSET-01`.

