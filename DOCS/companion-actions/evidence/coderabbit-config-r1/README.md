# CodeRabbit configuration correction R1

This candidate replaces the unsupported root `skip_files` field with supported negative patterns under `reviews.path_filters`. It enforces the same four exclusions that the old file declared. The old field was ignored by CodeRabbit, so effective filtering changes. All other settings remain equal, including `auto_review.drafts: false`.

Base: `91dd836ce3f7ea19b8d2e257a9dbdf612cc662e4`.
Branch: `fix/companion-coderabbit-path-filters-359`.
Root-owned worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/root-companion-coderabbit-config-359`.

The full bot comment was read through the GitHub connector. It skips draft review and reports one invalid key. The configuration predates this PR's Companion changes: commit `75b75c620077bf9d084b5c9c41296e68f0947d91`. No application finding or review approval came from the notice. No manual-review comment was sent.

Failure conditions: the candidate fails the current official schema, loses or changes one declared exclusion, changes another setting, enables draft reviews, or changes application source.

The official schema returned HTTP 200 and 84,834 bytes. Its SHA-256 is `81522b6fc5450f97dda11325fcf70ec803e39bbca402997879056ed09594da15`. It uses JSON Schema 2020-12, rejects unknown root properties, and defines `reviews.path_filters` as include/exclude glob patterns with `!` for exclusions. The first web-tool fetch could not access the JSON endpoint. A direct HTTPS fetch of the same official URL succeeded. No third-party explanation was used as authority.

The exact base configuration fails schema validation with one error: unexpected `skip_files`. The corrected configuration passes with zero errors. Parsed comparison proves the four original strings gain only the required exclusion prefix and move to the supported field. It also proves every other field stays equal. `git diff --check` passes. `verify.py` repeats these checks from either the candidate checkout or an independent checkout.

Verification uses isolated local tools: jsonschema 4.25.1 and PyYAML 6.0.3. Their resolved versions are retained. No application package, lockfile, CI workflow, instruction file or skill changed. Impeccable remains 3.9.1. Application tests and exports were not rerun for this configuration-only change.

Limits: local schema and policy comparison do not prove CodeRabbit's hosted parser response or review coverage. The next pushed candidate must retain draft status and be checked for the configuration warning. No code review was requested from the bot. Independent review and integration remain pending. No ticket, native or release acceptance follows.

No native, Docker, profile-worker, integration, PR or hosted write ran. The existing code candidate and its frozen runtime inputs remain unchanged. The root-owned worktree, isolated validation environment and raw fetch/install files remain for review. No owned command runner remains after validation.

COMPANION_CODERABBIT_CONFIG_R1_CORRECTION_DONE
