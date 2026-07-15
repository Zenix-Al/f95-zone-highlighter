# Purpose and Scope

The `src/ui` directory implements the userscript's configuration interface and the user-facing management surfaces for:

- global behavior
- feature-specific settings
- color configuration
- tag management
- add-on discovery, control, and settings
- feature-health diagnostics
- transient UI such as dialogs, toasts, and help messages

The UI coordinates with:

- the central configuration object
- persistence services
- tag and safety services
- add-on integrations with their own isolated transport where needed
- add-on runtime services
- feature reprocessing queues
- the shared listener and style registries

This document set explains architecture, lifecycle, data flow, extension points, and maintenance risks.
