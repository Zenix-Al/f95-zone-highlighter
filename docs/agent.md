# AI Agent Guidelines (`agent.md`)

Welcome, fellow AI! If you are reading this, you have been tasked with modifying, debugging, or adding features to the **Latest Highlighter** userscript. 

This project uses a highly customized, performance-oriented **mini-framework** located in `src/core`. If you treat this like a standard vanilla JavaScript userscript, you **will break things**. Please read these rules carefully.

## 🔴 CRITICAL RULES 🔴

1. **NEVER use `new MutationObserver()`**. 
   - We use a single global observer for performance. 
   - If you need to watch the DOM, import `addObserverCallback` from `src/core/observer.js`. 
   - **Do not** write your own observer logic.

2. **NEVER inject `<style>` tags directly into `document.head`**.
   - The UI is isolated using a Shadow DOM. 
   - Features that require CSS must use `createStyledFeature` (from `src/core/createStyledFeature.js`) and pass the CSS string via the `styleCss` property.

3. **NEVER attach global event listeners without cleanup**.
   - If you use `window.addEventListener`, you must remove it in the feature's `disable` function. 
   - Even better, use `addListener` from `src/core/listenerRegistry.js` which handles automatic garbage collection when features are disabled.

4. **ALL features MUST be created via the Factory**.
   - Do not write functions that just execute immediately.
   - Export a feature created by `createFeature` or `createStyledFeature` from the feature module (use a `*Feature` export name, e.g. `export const myFeature = createFeature(...)`).
   - The repository discovers `*Feature` exports from `src/features/*/index.js` and generates `src/generated/features.generated.js`. Do not edit that generated file or manually import features into `src/loader.js` or `src/core/featureCatalog.js`.
   - Refresh the manifest without a version bump with `node -e "require('./scripts/featureManifest.cjs').generateFeatureManifest({ rootDir: process.cwd() })"`.
   - Ensure you define an `enable` and `disable` method.

5. **Heavy DOM operations MUST use the Task Queue**.
   - Do not run heavy loops over hundreds of DOM nodes synchronously.
   - Use `createTaskQueue` from `src/core/taskQueue.js` to debounce and schedule DOM writes.

## Context & Project Structure

Before you start writing code, please read the architectural docs if you haven't already:
- `docs/architecture.md`: How the script boots up.
- `docs/core/index.md`: The core APIs you *must* use.
- `docs/features/creating-features.md`: Step-by-step on how to scaffold a new feature.

## Debugging

If you are asked to debug an issue:
1. Check `src/core/featureHealth.js` or ask the user to check their console for `[Bootstrap]` or `[Observer]` errors.
2. Check if a feature is failing to enable because `isApplicable` is returning false for the current route.
3. Review `src/core/StateManager.js` (`stateManager.get("...")`) to see if the global state is what you expect it to be.

## Final Note

Do not "get lost in the sauce." Stick to the established patterns in `src/core` and `src/features`. Do not invent new lifecycle paradigms. If a core utility exists for your task, use it!

---

## 🧠 Token & Quota Efficiency (Read This First)

This section is written for **Gemini / Antigravity** agents. The cost is not context loss — it is the **volume and size of tool calls**. Every `view_file` on a 600-line source file, every `run_command` output, every large search result burns quota. Follow these rules to stay efficient.

### The Reading Hierarchy — Docs Before Source

```
docs/agent.md          ← You are here. Read this and stop.
  ↓ only if needed
docs/architecture.md   ← Boot flow, layer overview (lightweight)
docs/core/index.md     ← Core module list & links (lightweight)
  ↓ only if your task touches that module
docs/core/<module>.md  ← Targeted module docs (lightweight)
  ↓ only as last resort
src/core/<file>.js     ← Actual source (expensive, use StartLine/EndLine)
```

**Never open a source file to "get a feel" for the codebase.** If docs exist for it, read the doc. If you need one specific function, `grep_search` for it first, then read only those lines.

### Rules for File Reading

1. **Always use `grep_search` before `view_file`**. Find the function/export/pattern first, then read only the lines you need via `StartLine`/`EndLine`.
2. **Always parallelize independent reads**. If you need 3 files, open all 3 in one tool call block, not one at a time.
3. **Never re-read a file already in your context window.** If you read it earlier in the conversation, the content is still there — scroll up mentally, don't call `view_file` again.
4. **Use `list_dir` over `view_file` to explore structure.** It gives you the full layout at almost zero cost.
5. **Cap `view_file` reads to what you need.** Use `EndLine: 80` if you only need the top of a file. Don't read 400 lines to find something on line 12.

### Rules for Commands

1. **Do not run commands speculatively.** Only run a command if the output is directly required to complete the task.
2. **Prefer targeted `grep_search` over broad `run_command` with `find`/`grep`.**

### Quick Orientation (Without Reading Everything)

If you've just been dropped into this project and need to orient fast, read **only these** in order:

1. This file (`docs/agent.md`) — rules and gotchas
2. `docs/architecture.md` — how it boots
3. The specific `docs/core/<module>.md` for the module your task touches

That's it. Do not read `src/main.js`, `src/loader.js`, or any feature source files until you know exactly why you need them.
