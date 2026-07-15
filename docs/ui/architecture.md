# High-Level Architecture

```mermaid
flowchart TD
    A[src/ui/index.js] --> B[Shadow DOM host]
    A --> C[Configuration dock button]
    A --> D[UI and document CSS]

    C --> F[Settings modal lifecycle]
    F --> G[Static HTML skeleton]
    F --> H[Panel navigation]
    F --> I[Metadata-driven settings renderer]
    F --> J[Tag management UI]
    F --> K[Add-on management UI]
    F --> L[Feature-health report]

    I --> M[settingsService]
    I --> N[Feature effects and reprocessing queues]
    J --> O[tagsService]
    J --> P[safetyService]
    K --> Q[addonsService and add-on registry]

    M --> S[Userscript storage]
    O --> S
    Q --> T[Add-on storage, lifecycle, and UI hosts]
```

Layers:

- Bootstrap and host creation: Shadow DOM, styles, dock/button
- UI skeleton and lifecycle: modal injection, lifecycle bindings
- Metadata-driven rendering: metadata → controls → persistence/effects
- Feature/service integration: delegate domain work to services
