# #367 root announcement correction, partial handoff

The independent R1 probe ran the actual removal control, service and database. It failed
by assertion at candidate 7f32abf3 because the application announced Saved. Task state:
Not started. Its retained result and excerpt are supplied here. The root did not repeat
that database run.

The root added permanent announcement assertions to the existing real-stack mobile case
before changing TaskStatePanel. Cancel must announce no result. Removal and Undo must
announce their named removal and restore results once. State-change announcements retain
the existing fallback. The real-stack case has not yet run on the root correction. No
assertion-level GREEN is claimed for S2. The larger S1 correction worker must run it with
both explicit owned container settings before independent round2 review.

Root typecheck and changed-file lint exited 0. Existing mounted state-control regressions
also pass; they do not exercise removal. New announcement assertions were added before
the fix, but were not executed by the root. Do not call this a complete root TDD cycle.
The independent R1 assertion failure predates this fix.

No new translation is needed. There is no web change. This is not ticket acceptance,
observed VoiceOver/TalkBack, native focus or release proof. No local stack ran here.
