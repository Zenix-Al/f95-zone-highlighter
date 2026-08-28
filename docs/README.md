# Latest Highlighter - Documentation

Welcome to the documentation for the Latest Highlighter userscript. This directory serves as a comprehensive guide for human contributors and AI agents alike, explaining how the project is structured, how the custom mini-framework operates, and how to add new features or modify existing ones without breaking the ecosystem.

## Goals of this Documentation
1. **Clarity**: Ensure the custom framework (`src/core`, `src/services`, `src/ui`) is well-understood.
2. **Consistency**: Provide guidelines (`agent.md`, `features/creating-features.md`) for adding new features using the framework's APIs (e.g., `createFeature`, `createStyledFeature`).
3. **Agentic Context**: Ensure AI coding assistants can quickly orient themselves and avoid generating code that conflicts with established patterns (e.g. adding vanilla DOM mutations instead of using `observer.js`, or standalone styling instead of using `ui/renderers/`).

## Table of Contents

- [Core Architecture](architecture.md) - High-level overview of how the app boots and runs.
- [Library Update Inbox](architecture/library-update-inbox.md) - Durable update acknowledgement, bounded inbox queries, and page-session notification behavior.
- [Library Update Queue Baseline](architecture/library-update-queue-baseline.md) - Current scheduler entry points, interruption boundaries, database capability, and pre-queue size evidence.
- [Library Update Queue Schema](architecture/library-update-queue-schema.md) - Version-4 cycle/queue stores, recoverable publication, and repository contracts.
- [Library Update Queue Snapshot](architecture/library-update-queue-snapshot.md) - Bounded eligible-record snapshots, deterministic ordering, and cancellation cleanup.
- [Library Update Queue Worker](architecture/library-update-queue-worker.md) - One-item claims, canonical commit ordering, retry fairness, heartbeat ownership, and scheduler cutover.
- [Library Update Queue Recovery](architecture/library-update-queue-recovery.md) - Restart recovery, local-day rollover, durable allowance, and cross-tab ownership.
- [Library Update Queue Settings and UI](architecture/library-update-queue-settings-ui.md) - Migrated controls, stable live progress, and state-derived queue actions.
- [Library Update Queue Compatibility](architecture/library-update-queue-compatibility.md) - One-time legacy metadata carry-forward, retired fallback paths, and identity-bounded cleanup.
- [Library Update Queue Verification](architecture/library-update-queue-verification.md) - Automated release evidence and the remaining browser smoke gate.
- [Library Legacy Upgrade Guard](architecture/library-legacy-upgrade-guard.md) - Retired schema-v1 conversion, the v1.2.2 bridge, and fail-closed direct-upgrade handling.
- [Thread Utility Baseline](architecture/thread-utility-baseline.md) - Reference quick-search behavior and the canonical opening-post fixture contract.
- [Thread Utility Golden Contract](architecture/thread-utility-golden-contract.md) - Bounded Example Add-on bootstrap, API, lifecycle, UI ownership, and teardown requirements.
- [AI Guidelines](agent.md) - Strict rules for AI agents modifying this codebase.
- **Modules**
  - [Core](core/index.md) - The mini-framework (feature factory, observer, task queue).
  - [Features](features/index.md) - The individual functionalities and how to create them.
  - [Services](services/index.md) - Background services for state, tags, settings, and addons.
  - [Common Add-on Mistakes](services/addon-common-mistakes.md) - Registration, lifecycle, authorization, UI ownership, and cleanup traps.
    - [Add-on Development](services/addon-development.md) - Detailed guide and API reference for building add-ons.
    - [Latest Overlay Capture](services/fastCapture.md) - Private early capture for the site's Latest response.
  - [UI](ui/index.md) - Rendering principles and Shadow DOM usage.
    - [Components](ui/components.md) - Reusable UI widgets (dialogs, toasts, picker).
  - [Config](config/index.md) - Configuration, defaults, and page definitions.

## Maintenance scope

Core cleanup documentation covers `src/config/**`, `src/core/**`, non-add-on services and
features, core UI, tests, and core tooling. Add-on runtime, catalog, bridge, trust, and add-on UI
work is tracked separately under `addons/**`; it is not a prerequisite for the core-cleaning plan.
