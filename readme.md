# F95Zone Ultimate Enhancer

A userscript that improves F95Zone's Latest Updates and thread pages through a configurable core and optional add-ons.

- [Install from Greasy Fork](https://greasyfork.org/en/scripts/546518-f95zone-ultimate-enhancer)
- [Documentation](docs/README.md)
- Generated core script: `dist/f95zone-ultimate-enhancer.user.js`

The project is in maintenance mode. Critical bugs, compatibility problems, and
security issues are still maintained, but major new features are expected to
live in add-ons.

## Core features

- Latest Updates overlays, scoring, layouts, refresh controls, and recovery
- Thread overlays, wide layout, and collapsible signatures
- Preferred, excluded, and marked tag management with custom colors
- Isolated settings UI, configuration transfer, and Feature Health diagnostics
- Capability-gated add-on runtime with owned storage, UI, lifecycle, and cleanup
- Verified configuration bootstrap, schema migration, backup recovery, and
  read-only failure handling

The generated feature inventory is maintained in
[docs/features/index.md](docs/features/index.md).

## Optional add-ons

Official add-ons currently include:

- **Library** — personal thread library, ratings, notes, history, and durable
  update checking
- **Masked + Direct Download** — masked-link handling and automation for
  supported download hosts, with limited standalone behavior
- **Latest Filters** — saved Latest-page filters and search utilities
- **Thread Utility** — compact thread information and thread-page tools
- **Site Repair** — independently controlled F95Zone compatibility repairs
- **Halloween Theme** — optional seasonal presentation

Add-ons are separate userscripts with independent versions. See
[addons/README.md](addons/README.md) for the current architecture and
[addons/example-addon](addons/example-addon) for the canonical API example.

## Development

Requirements: an LTS Node.js release and npm.

```bash
npm install
npm run lint
npm test
```

Useful non-release checks:

```bash
npm run check:manifest
npm run check:docs
npm run check:inventory
npm run audit:core
npm run check:core
npm run build:core:smoke
npm run audit:css
npm run check:css
```

Core builds:

```bash
npm run build:no-bump
npm run build:release:no-bump
```

Release builds may update generated distributions and versions. Do not run
`npm run build` merely to validate source changes. Add-on builds and versions
are independent; their commands are documented in [addons/README.md](addons/README.md).

## Repository layout

- `src/main.js` — bootstrap orchestration
- `src/loader.js` — generated, page-scoped feature loading
- `src/features/` — core feature implementations
- `src/config/` — defaults, schema, persistence policy, and page definitions
- `src/core/` — lifecycle and resource-management primitives
- `src/services/` — storage, configuration, tags, and add-on services
- `src/ui/` — Shadow DOM settings UI and reusable components
- `addons/` — independently built add-ons
- `docs/` — architecture, development, API, and verification documentation
- `tests/` — deterministic core and add-on regression coverage
- `dist/` — generated artifacts; never edit these directly

Start with [docs/README.md](docs/README.md) for the complete documentation map.

## Adding a core feature

The full guide is [docs/features/creating-features.md](docs/features/creating-features.md).
The current short workflow is:

1. Create `src/features/<feature>/index.js`.
2. Export a const whose name ends in `Feature`, created with `createFeature()` or
   `createStyledFeature()`.
3. Declare `configPath`, `pageScopes`, applicability, lifecycle handlers, and
   optional feature-owned `settingsUi` metadata.
4. Put persisted defaults in `src/config/defaults.js` and metadata/validation in
   `src/config/schema.js`.
5. Add page rules only through `src/config/pageDefinitions.js`.
6. Use core listener, observer, task, style, and resource ownership APIs so
   `disable()` fully reverses the feature.
7. Regenerate the feature manifest and run lint/tests.

```bash
node -e "require('./scripts/featureManifest.cjs').generateFeatureManifest({ rootDir: process.cwd() })"
npm run lint
npm test
```

Do not manually import features into `src/loader.js`, register them in
`src/core/featureCatalog.js`, edit `src/generated/features.generated.js`, or
create raw `MutationObserver` instances.

## Documentation

- [Architecture overview](docs/architecture.md)
- [Creating core features](docs/features/creating-features.md)
- [Core framework](docs/core/index.md)
- [Configuration](docs/config/index.md)
- [Storage bootstrap](docs/config/storage-bootstrap.md)
- [UI system](docs/ui/index.md)
- [Add-on development](docs/services/addon-development.md)
- [Common add-on mistakes](docs/services/addon-common-mistakes.md)
- [Changelog](changelog.md)

## Contributing

Edit source rather than generated userscripts, preserve feature cleanup and
page-scope behavior, and add focused regression coverage for changed contracts.
Repository-specific agent and contributor rules are recorded in `AGENTS.md`,
`.rules.md`, and [docs/agent.md](docs/agent.md).
