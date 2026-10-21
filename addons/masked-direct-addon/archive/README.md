# Historical managed / masked download implementation

Archived during standalone rework Wave 2 (2026-10-20). This is reference code,
not a supported runtime, restoration switch, or separate build target.

Snapshots preserve the retired F95 Resolve/Direct DL controls, masked resolver
and CAPTCHA context, managed request/source identity, origin tab handles/closing,
marker recovery and targeted result delivery. Mixed-responsibility entry points
are snapshots too; their live counterparts retain only standalone/F95-settings work.

Relative imports inside this archive point to archived snapshots when available
and otherwise to retained `src/` dependencies. It is not an independently frozen
copy of every shared dependency. To restore any former behavior, deliberately
review current APIs, settings, host guards and tests first. Never import this tree
from production. No live signed links or user identifiers are stored here.

The ordinary add-on entry remains `src/main.js`. Wave 2 tests inspect its bundled
import graph to prove archived code and managed closing cannot ship.

Archive-only characterization tests were removed after the standalone rework.
Current host, pipeline, feedback, settings, cleanup and continuation tests load
production code; bundle-boundary tests ensure this archive cannot ship.
The archived manifest contains only the old add-on entry for characterization;
it is not an installable or generated catalog. Old settings/close-delay transport
is archived too. These snapshots do not define current UI or permissions.
