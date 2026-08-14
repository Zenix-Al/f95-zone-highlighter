# Masked Direct `/masked/` standalone baseline

This records `MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01`. It changes no
production source, persisted value, manifest, version, or distribution.

## Current ownership

F95 thread and `/masked/*` routes both classify as `f95-core` with
`usesCore: true`. The bootstrap performs the complete core probe and returns
before registration, access refresh, enabled-state initialization, or page
behavior whenever core remains unavailable. Captcha frames and supported
external hosts use separate standalone branches; unsupported routes do nothing.

Consequently, the current `/masked/*` page performs no resolution without
core. A prior missing-core host-policy publication does not alter that F95
ownership.

## Resolver dependency inventory

| Area | Current dependency/behavior |
|---|---|
| Preference | `readThreadFlags(false)` and `skipMaskedLink !== false` |
| Transport | same-origin `XMLHttpRequest` POST to `location.pathname` |
| Headers | form URL encoded content type and `X-Requested-With: XMLHttpRequest` |
| Body | `xhr=1&download=1`, plus URL-encoded-form captcha token field |
| Success | parsed object with `status: ok` and `msg`, normalized before navigation |
| Captcha | `status: captcha`, existing `#captcha`, global `grecaptcha.render`, one callback retry path |
| HTTP/parse failure | existing `#error` content and `#loading` visibility |
| Continue page | first matching `.host_link`/leaving anchor is clicked |
| Page elements | leaving container/text, loading, captcha, and error IDs/selectors |
| Scheduling | immediate `trySkipMaskedPage()` plus a 900ms interval |
| Teardown | only the interval is registered through `addTeardown` |
| Destination | controller directly assigns `location.href` |

The resolver module imports no processing-request repository, route context,
direct-download event transport, managed-tab registry, or managed-close code.

## Confirmed duplicate risk

`enableMaskedPageHooks()` starts one asynchronous resolver immediately and its
900ms interval invokes the same function again without an in-flight, terminal,
or generation guard. If the first XHR remains pending at the first tick, a
second identical POST begins. Repeated page-behavior apply calls can also create
a fresh owner after teardown while an earlier XHR callback remains live.

The baseline test demonstrates two pending POSTs with identical endpoint and
body. Future runtime work must replace this with one operation owner rather
than adding another interval flag.

## Canonical fixtures

`tests/fixtures/masked-direct/masked-page.html` records the existing Continue,
leaving, loading, captcha, and error elements. `masked-responses.json` records
success, HTTP failure, malformed JSON, captcha, invalid destination, and
Continue-page cases for later behavior tests.
