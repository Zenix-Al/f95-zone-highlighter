# Project TODO

Current focus: design and implement an Add-ins (plugins) system so heavy/optional
features can be distributed as separate userscripts (add-ins) that register with
the core. This keeps the main script small while allowing large, opt-in
extensions (e.g. a Threads library).

## Roadmap (high-level)

1. Design & Spec (planning)
   - Define `registerAddon` API contract and capability manifest.
   - Decide event names, RPC shape, storage semantics, and permission model.
   - Produce a short `ADDINS.md` describing the expected behavior for add-in
     authors and the core's compatibility policy.

2. Bridge Design
   - Implement a tiny primary bridge available on `window` (direct calls when
     possible) and a CustomEvent-based RPC fallback for sandboxed managers.
   - Keep the bridge lazy-init and minimal to reduce size impact.
   - Define unique event names and timeouts for requests.

3. Core API & Storage
   - Implement `registerAddon({ id, name, version, permissions })` → `AddonHandle`.
   - `AddonHandle` should expose: `on/off`, `emit`, `request`, `storage.get/set/remove`,
     and `destroy()`.
   - Core proxies persistent storage for add-ins under `addon:<id>:...` keys so
     add-ins don't need extra user grants.
   - Enforce size/rate limits on storage/RPC to avoid abuse.

4. UI / UX
   - Add an Add-ins section to Settings with enable/disable, permissions, and
     an Open button to surface add-in UIs inside the core modal.
   - Allow assigning keyboard shortcuts to open add-ins via the core UI.
   - Show API version and compatibility status for each registered add-in.

5. Developer Experience
   - Ship an `extras/addin-skeleton.user.js` skeleton and `ADDINS.md` usage
     examples.
   - Provide a local test harness that fakes the bridge for add-in dev.

6. Sample Add-in
   - Build a sample `threads` add-in that demonstrates registration, namespaced
     storage, subscribing to `tagsUpdated`, and opening its UI modal through
     the core API.

7. Testing & Release
   - Run compatibility tests across popular userscript managers (Tampermonkey,
     Violentmonkey, Greasemonkey) and pages where the script runs.
   - Document the security/permission model for users and add-in authors.

## Notes, trade-offs, and constraints

- Benefits: keeps core small, avoids multiple competing UIs, reduces collisions,
  makes heavy features opt-in and independently updatable.
- Costs: added complexity for bridge + maintenance of a stable API surface,
  UX for enabling/disabling add-ins, and potential compatibility overhead.
- Strategy: favor a tiny, well-documented API, require user opt-in for add-ins,
  and version the API so changes are manageable.

## Next step

- Finalize the `registerAddon` spec and event/RPC names in `ADDINS.md` (planning
  step). Once you confirm, implement the bridge and a minimal `registerAddon`
  shim in the core, then scaffold a sample add-in.
