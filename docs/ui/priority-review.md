# Priority Review Notes

Top items to verify:

- Synchronization effect coverage (metaRegistry vs persisted keys)
- Placeholder settings (`latestSettings.js`, `threadSettings.js`) clarity
- Unsupported metadata types reaching the generic renderer
- Duplicate outside-click handling for tag search
- Mixed listener ownership and teardown
- Add-on HTML trust and sanitization boundaries
- Shadow/document split rules and z-index/focus issues
- Persistence failure handling and rollback behavior
- Add-on setting schema parity with core renderer
- Terminology consistency (Add-ons vs Add-ins)
- Accessibility checks (focus, trap, live regions)