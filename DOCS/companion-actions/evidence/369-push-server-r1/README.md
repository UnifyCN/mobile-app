# Companion 369 push server stage

Read [HANDOFF.md](HANDOFF.md) for the fixed candidates, contracts, proof classes, and remaining conditions. Read [CLIENT_CONTRACT.md](CLIENT_CONTRACT.md) for the later MOBILE request/response contract.

The authoritative MOBILE migration and exact WEB mirror are committed. Enrollment and dispatch remain disabled by default. No disposable probe was merged. No ticket or release is accepted.

Final local results are 58/58 new tests in each of two runs with 307 matching inputs, 254 existing backend tests across 38 files in the final per-file result set, 277 Edge tests, and 776 WEB tests with 13 existing skips. Four faults reach binding assertions. The restored control passes. Build, type, i18n, and changed-lint gates pass. Six older type errors and 12 full-lint errors remain mapped baseline limits.

The owned runtime is removed. Protected resources match except the recorded automatic default bridge replacement. Keep `strict_network_ids_unchanged=false`. Root and independent review must assess that narrow exception.

Evidence: `summary.json`, `test-order.md`, `self-check.md`, `mirrors.json`, `frozen-source.json`, `implementation-pins.json`, `cleanup-comparison.json`, and `bridge-exception.md`. The final enclosing evidence commit is recorded after commit in ignored `final-pins.json` and the final response. Private runtime/cache/log copies remain stopped and ignored.

COMPANION_PUSH_369_SERVICE_R1_REVIEW_READY
