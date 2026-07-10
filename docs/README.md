# Latest Highlighter - Documentation

Welcome to the documentation for the Latest Highlighter userscript. This directory serves as a comprehensive guide for human contributors and AI agents alike, explaining how the project is structured, how the custom mini-framework operates, and how to add new features or modify existing ones without breaking the ecosystem.

## Goals of this Documentation
1. **Clarity**: Ensure the custom framework (`src/core`, `src/services`, `src/ui`) is well-understood.
2. **Consistency**: Provide guidelines (`agent.md`, `features/creating-features.md`) for adding new features using the framework's APIs (e.g., `createFeature`, `createStyledFeature`).
3. **Agentic Context**: Ensure AI coding assistants can quickly orient themselves and avoid generating code that conflicts with established patterns (e.g. adding vanilla DOM mutations instead of using `observer.js`, or standalone styling instead of using `ui/renderers/`).

## Table of Contents

- [Core Architecture](architecture.md) - High-level overview of how the app boots and runs.
- [AI Guidelines](agent.md) - Strict rules for AI agents modifying this codebase.
- **Modules**
  - [Core](core/index.md) - The mini-framework (feature factory, observer, task queue).
  - [Features](features/index.md) - The individual functionalities and how to create them.
  - [Services](services/index.md) - Background services for state, tags, settings, and addons.
    - [Add-on Development](services/addon-development.md) - Detailed guide and API reference for building add-ons.
    - [Fast Capture](services/fastCapture.md) - Documentation on early network response caching.
  - [UI](ui/index.md) - Rendering principles and Shadow DOM usage.
    - [Components](ui/components.md) - Reusable UI widgets (dialogs, toasts, picker).
  - [Config](config/index.md) - Configuration, defaults, and page definitions.
