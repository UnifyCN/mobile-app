# supabase/backfills/

One-off **data** procedures. Not schema, not a migration sequence.

`supabase/migrations/` is for DDL that every environment must converge on. Files
here repair or move rows in a specific database at a specific moment. They are
applied once by hand, and nothing replays them. Keeping them out of
`migrations/` stops a migration runner from picking them up.

Conventions:

- Name `<timestamp>_<what>.sql` (or `.md` for a runbook), so the folder reads
  chronologically.
- Open with a header comment: **why** it is needed, **how the values were
  derived**, the **scope guard** that bounds what it touches, and **how to
  revert**.
- Carry a `STATUS:` line that says whether it has run, and on which project.
  Update it when it runs.
- Prefer statements that are safe to run again.
- Apply by hand in the Dashboard SQL editor. `supabase db push` is unsafe
  against the drifted shared history.

The shared production database `wrbauxutkysljmsqojts` has live mobile and web
users. Scope guards are mandatory, and a destructive statement needs sign-off.
