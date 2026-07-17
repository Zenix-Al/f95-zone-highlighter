# Add-on baseline

`ADDON-BASELINE-01` records the accepted add-on metadata and size baseline in
`docs/architecture/addon-baseline.json`. The report is regenerated after accepted
metadata-contract changes so later packages can compare source and bundle deltas.

Run the deterministic audit with:

```powershell
npm run audit:addons
npm run check:addons:baseline
npm run build:addons:smoke
npm run check:addons:catalog
```

The audit reads the manifest and trusted catalog, inventories public actions and service exports,
captures lifecycle behavior snapshots, measures each add-on userscript separately, and measures
`src/services/addonsService.js`, `src/services/addons/**`, and add-on UI integration separately.
Regular and release builds use temporary output and fixed headers. No timestamp, absolute path,
version, cache, generated catalog, or tracked `dist/` file is written.

`ADDON-SCOPE-02` makes manifest `pageScopes` and `runtimeMode` authoritative while preserving
the existing userscript header matches, grants, and run timing. `scripts/addon-catalog.cjs`
generates and checks the identifier and content-hashed catalog under `src/generated/`
deterministically. It also keeps `src/services/addons/trusted-catalog.json` published solely for
legacy released cores; the current core does not read that compatibility file. Activation
matching, core scope intersection, management policy, trust, and capability authorization are
separate decisions.

The scope-contract measurement delta from the accepted `ADDON-BASELINE-01` report is recorded
in the regenerated JSON. The added metadata increases each add-on userscript by approximately
370–510 regular bytes and 378–445 release bytes; core add-on-service authored bytes increase
from 15,963 to 16,702 for the registry/policy wiring and from 121,506 to 132,654 for the
scope-aware service/catalog footprint. Add-on UI integration remains 44,769 authored bytes.

The baseline JSON records that the trusted-add-on contradiction was not reproducible during the
baseline package. `ADDON-TRUST-GATING-01` later supplied the executable stale-projection fixture,
documented the root cause, and resolved the contradiction without changing the registration
handshake or userscript header metadata.
