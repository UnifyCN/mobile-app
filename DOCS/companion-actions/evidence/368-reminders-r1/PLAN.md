# Ticket 368 implementation

Assigned mobile base: 61a4134c786c37f65a02baca2364fd7e18ea2509.
Assigned web base: 914e4f54b08deaa9cf48e25aa86041720e6296db.
Approved probe: 559b56d99e21c0bd9f30928245a1d6a53e85bbe6, merged without source edits.

## Binding falsifiers

- Concurrent authenticated retries save two schedules or two due events.
- Foreign messages, proposals, tasks or accounts authorize a write or expose a reminder.
- A stopped reminder returns as due after its stop commits.
- A worker locks a reminder before its parent, blocks unrelated tasks, or starves a valid item after an item failure.
- Undo, reopen, rollback or reapply restarts stopped work.
- A gap or offset-free fold saves, or a zone change moves a saved UTC instant.
- An unknown result retries without lookup, an offline approval executes on reconnect, or a late account response enters a new account's view.
- A reminder opens a different source with the same numeric id, changes task state, or needs an AI call.

Use authenticated shared action requests and persisted outcomes as the primary boundary. Use rendered components for controls and navigation. Keep database, scheduler, rendered, native and hosted proof separate. No model call, hosted action, push or acceptance is authorized.
