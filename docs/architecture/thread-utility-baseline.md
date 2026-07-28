# Thread Utility reference and fixture baseline

This document records `THREAD-UTILITY-BASELINE-01`. It is a characterization
package only: it does not add Thread Utility production source, manifest
metadata, runtime behavior, or generated output.

## Reference quick-search behavior

The initial concept comes from
[`addons/reference/F95 Utility buttons.user.js`](../../addons/reference/F95%20Utility%20buttons.user.js),
version 3.0 by GGD40727. The reference declares the MIT license. Thread Utility
must credit the author and source concept in its README and initial changelog;
it should adopt the behavior through the repository's add-on architecture
rather than copying the reference's raw modal, styles, GM storage, or global
listeners.

The characterized defaults, in order, are:

| ID concept | Label | Query | Include thread title |
| --- | --- | --- | --- |
| update | Update | Update | yes |
| new-compressed | New+Compressed | Compressed | yes |
| compressed | Compressed | Compressed | no |
| walkthrough | Walkthrough | Walkthrough | yes |
| mod | Mod | Mod | no |
| cheats | Cheats | Cheats | yes |

The reference settings allow:

- choosing whether searches open in a new tab;
- editing each button label and query;
- enabling title inclusion per button;
- adding a button;
- moving buttons up or down;
- deleting buttons;
- saving only non-empty label/query pairs;
- refusing to replace the saved list with an empty list.

These are behavior inputs for the later quick-search package, not persistence
compatibility requirements. The reference keys `openInNewTab` and
`f95_custom_buttons` must not be reused by the new add-on.

## Canonical thread fixture

[`addons/reference/sample.html`](../../addons/reference/sample.html) is the
canonical first implementation fixture. The fixture is intentionally left
unchanged by this package.

### Header contract

- Title and prefix root: `h1.p-title-value`
- Header tags: `.js-tagList a.tagItem`
- Rating source: `select[name="rating"][data-initial-rating]`

The sample represents:

- prefixes `Others` and `Completed`;
- title `Daiakuji`;
- version `v2.18.0`;
- developer `AliceSoft`;
- a header tag list;
- the public rating control.

### Opening-post contract

The primary starter selector is:

```css
article.message-threadStarterPost
```

The bounded content root is:

```css
.message-body .bbWrapper
```

The visible `#1` attribution is a fallback verification signal only. It is not
the primary selector because visible numbering and attribution markup are less
stable than the dedicated starter-post class.

Extraction must exclude:

- `.message-cell--user`;
- `.message-attribution`;
- `.message-actionBar`;
- `.reactionsBar`;
- `.message-signature`;
- screenshots and `.js-lbImage` lightbox links;
- unrelated replies.

### Represented sections

The sample contains:

- `Overview`, which is the canonical Description alias;
- Developer and Version metadata;
- Installation content inside a spoiler;
- a Win download group.

Description and Installation demonstrate nested XenForo spoiler wrappers. A
later parser may normalize their supported text structure, but it must not
clone the complete opening-post HTML.

### Represented downloads

The Win group contains:

- a Datanodes direct link followed by a Masked Direct `Direct DL` button;
- masked GoFile, MEGA, PixelDrain, and WorkUpload links;
- one adjacent Masked Direct `Resolve` button for each masked link.

The injected buttons use:

- `.f95ue-addon-resolve-btn`;
- `data-addon-id="masked-direct-addon"`;
- `data-action-type="direct"` with `data-direct-href`;
- `data-action-type="masked"` with `data-masked-href`.

These buttons characterize a safe delegation opportunity. Thread Utility may
invoke a current, connected matching page button after a direct user action.
It must not copy Masked Direct's listener, storage, request, or resolver logic.

## Supported baseline and fallbacks

This single sample establishes a canonical structure, not universal support for
every uploader or historical template.

Later extraction must degrade as follows:

| Missing or unrecognized input | Required behavior |
| --- | --- |
| Header field | Keep the remaining summary fields |
| Starter-post class | Try a bounded `#1` verification fallback |
| Starter content root | Keep summary and utility actions available |
| Description | Hide or mark only Description unavailable |
| Installation | Hide or mark only Installation unavailable |
| Download heading/group | Use only the conservative adjacent-resolver fallback |
| Masked Direct button | Keep Open and Copy; omit Resolve/Direct DL |
| Platform label | Render one flat Downloads group |
| Malformed/unsafe URL | Exclude that link |

No missing optional section may prevent the palette, summary, or independent
utility actions from working.

## Baseline test ownership

`tests/groups/thread-utility-baseline.cjs` verifies:

- the reference metadata, defaults, and settings affordances;
- exactly one canonical starter-post marker;
- required header and starter-content roots;
- direct and masked resolver-button examples;
- explicit contract names in assertion failures.

Production parser behavior belongs to later Thread Utility packages.
