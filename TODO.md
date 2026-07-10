# Documentation Project Tasks

## Goals
1. Document the mini-framework found in `src/` to ensure future contributors (including AI agents) don't get "lost in the sauce".
2. Create an `agent.md` providing explicit rules and contextual knowledge for AI agents working on this project.

## Proposed `docs/` Structure

```text
docs/
├── README.md                 # Entry point, high-level project summary and links to other docs
├── architecture.md           # Core architecture (how core, features, and services interact)
├── agent.md                  # Instructions, rules, and context specifically for AI agents
├── core/
│   ├── index.md              # Overview of the core mini-framework
│   ├── featureFactory.md     # How features are created, registered, and scoped
│   ├── observer.md           # DOM mutation observation and element detection
│   ├── stateManager.md       # Global and feature-specific state management
│   ├── taskQueue.md          # Task scheduling, debounce, and frame budget
│   └── resourceManager.md    # Managing event listeners and teardown
├── features/
│   ├── index.md              # List of existing features
│   └── creating-features.md  # Step-by-step guide on creating new features using the framework
├── services/
│   ├── index.md              # Overview of services
│   ├── addonsService.md      # How external/internal addons are handled
│   ├── settingsService.md    # Reading/writing user settings
│   └── tagsService.md        # Tag fetching, parsing, and caching
├── ui/
│   ├── index.md              # UI rendering principles and Shadow DOM usage
│   └── components.md         # Reusable UI components
└── config/
    └── index.md              # Configs, defaults, page definitions, and selectors
```

## Next Steps
- [x] Create `docs/` directory.
- [x] Initialize `docs/README.md` and `docs/architecture.md`.
- [x] Document the `src/core` framework (`featureFactory`, `observer`, etc.).
- [x] Document `src/features` and `src/services`.
- [x] Write `docs/agent.md` tailored with explicit instructions on how an agent should read these docs and interact with the framework.
- [x] Document `src/config` and other missed core modules (`pageBridge`, `teardown`, etc.).

## Framework Hardening
- [ ] Move `src/core/dom.js` to `src/utils/dom.js` (or `src/ui/helpers/`).
- [ ] Decouple and clean up "fast capture" logic from the core framework.
- [ ] Move `src/core/tasksRegistry.js` to a more appropriate folder and document it.
- [ ] Refactor `config-transfer` feature into a proper service.
- [ ] Revisit and rework the storage mechanism.
- [ ] Optimize the Core Actions API creation inside `addonsService` (e.g., modularize `coreActions.js` into distinct registerable action files rather than maintaining a giant static mapping table).
