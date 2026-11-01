# #364 + #366 integration evidence (r1)

Summary and conflict/delta record: `DOCS/companion-actions/364-366-integration.md`.
Every file here is gzip of a raw record; `manifest.json` gives each source path, raw
byte size and raw SHA-256. `gate-gates.json.gz` lists the final gate commands, roots,
exits and durations (natural exits, no `ACTIONS_*` variables in the gate environment).
`*-1.log` files are the earlier runs, including the failed first web `npm test` and the
isolated rerun record `web-tasksteps-repeat.log`. `stack-env` (local keys) is not kept.
