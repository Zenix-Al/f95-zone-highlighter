# Event and Listener Lifecycle

Patterns used:

- Delegated event handlers for dynamic content.
- Named listener registry for repeat-safe bindings and cleanup.
- Direct document/window listeners for permanent events (use sparingly).
- One-time initialization guards to avoid duplicate bindings.

Recommendations:

- Prefer `listenerRegistry` ownership for repeat-sensitive bindings.
- Document permanent listeners and ensure cleanup paths for features.