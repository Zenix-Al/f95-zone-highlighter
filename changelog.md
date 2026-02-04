# Changelog

## Unreleased - Recent Architectural Refactor

This log tracks the major architectural changes and improvements made to the project.

### Added

- **`CHANGELOG.md`**: This file, to track development progress.
- **`GEMINI.md`**: A dedicated project guide to assist AI-driven development, documenting architecture, features, and workflows.

### Changed

- **Project Structure Rework**: The entire project has been reorganized with a more modular structure, separating features, services, UI components, and core logic into distinct directories.
- **Shadow DOM Implementation**:
  - All script-generated UI (settings modal, config button, toasts) is now rendered inside a Shadow DOM to prevent style conflicts with the host page.
  - All internal DOM queries have been updated to target the `shadowRoot`.
  - Event listeners have been refactored to be compatible with the Shadow DOM (e.g., using `e.composedPath()`).
- **CSS Architecture Split**:
  - Stylesheets have been split into `ui.css` (for encapsulated UI components) and `web.css` (for global styles affecting the host page).
  - The CSS injection logic now correctly places each stylesheet in the Shadow DOM or the document head, respectively.
- **Asynchronous UI Initialization**:
  - The settings modal initialization (`initModalUi`) is now an `async` function.
  - This resolves a race condition where the UI would attempt to render tag lists before the tag data was fetched, ensuring data is loaded before rendering.
- **Bug Fixes**:
  - Corrected numerous bugs where UI elements failed to render or event listeners failed to attach due to the Shadow DOM migration.
  - Fixed a layout issue in the settings modal where input fields would overflow their container.
  - Added a universal `box-sizing: border-box` rule and custom scrollbar styling to the modal for better stability and appearance.
  - **Restored Feature Loader**: The main `loader.js` file has been fixed to correctly initialize all page-specific features based on user configuration, resolving an issue where most features were not being loaded on startup.
  - **Feature & Service Refactor**: Reorganized feature logic out of the `services` and `ui` directories and into the `features` directory for better separation of concerns.
  - **Build Fixes**: Corrected multiple broken import paths across the project to resolve build errors after refactoring.
