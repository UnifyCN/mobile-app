# Free session-pooler correction R5

The user selected the free Supabase session pooler instead of the paid IPv4 add-on. The existing adapter rejected its tenant-qualified login before starting the worker. The correction is committed on both sources. Independent review is required. No integration, push, provider send or release acceptance occurs here.

## Fixed code

- Mobile: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-33359ffe`, branch `fix/companion-push-session-pooler-r5`, code head `62d52cf7944b4478579f1cf31686188e131ca1e8`, tree `af9a2c3b665baca566e7f35f039f7e0b312d0083`, base `c7758311b716f248113fbc52bfed8cd0681f1da9`. A later evidence-only commit adds this directory.
- Web: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-release-359`, branch `fix/companion-push-session-pooler-web-r5`, head `c7cef1cc3fd5e278620599ea2cdeb74d34f57685`, tree `536240f2aa065dbd38bde54c2c0de420ba0fe666`, base `60bbf6ced98b99a423788301768b9b8a53b2b251`.
- Each code commit changes only the worker `node-adapter.mjs`, `node-adapter.test.mjs`, and `README.md`. The three copies are byte-identical.

The direct username remains `companion_push_worker`. The additional form is `companion_push_worker.<project-ref>`, where the reference has exactly 20 lowercase letters. That form requires an `aws-<number>-<region>.pooler.supabase.com` hostname and explicit session port 5432. The existing PostgreSQL protocol, password, single `sslmode=verify-full`, operator, fixture refusal, deadlines and process ownership checks remain.

The actual session pooler accepts the existing pinned Supabase CA. The system trust store alone rejects that certificate chain. This fresh handshake result prevented an unnecessary TLS change. `process.ts`, TLS options, CA bytes, frozen dependencies, supervisor, SQL and migration source are unchanged.

## Falsifiers and results

Acceptance of an administrator or service-role login, a tenant-qualified login on another hostname or transaction port, weaker TLS, or loss of the existing direct connection would disprove the correction.

- Before the fix, the new valid session-pooler assertion failed: HTTP configuration returned 503 instead of 200. Four earlier controls passed. The unchanged red record is retained.
- The new case passes after the fix. Its ten refusal inputs cover transaction or missing port, three wrong role names, a malformed project reference, a direct endpoint, an attacker suffix, weaker TLS and duplicate TLS parameters.
- The complete Node set passes 16 reported checks, including one parent and four nested checks. Zero failures or skips. These counts overlap the focused file.
- Three faults fail at actual assertions: accepting administrator names, removing the hostname restriction, and accepting the transaction port. The temporary fault files were removed. Their logs remain.
- Web normal tests: 82 files pass; 847 tests pass and 19 skip. Build, including normal types, and locale parity exit 0. Full Web lint retains the supplied twelve prior errors. The worker MJS files are ignored by the existing lint configuration; no lint coverage is claimed for them. The Node loader executes the changed module in the tests.
- Both complete local Next traces pass. Dispatch has 785 files and 107,842,837 bytes. Readiness has 785 files and 107,842,901 bytes. Both contain all 635 required worker entries, the pinned executable at mode 0755, and no test, host cache or environment file. Each remains below 250 MB. This is local package proof, not managed execution.
- Mobile application and native source, database source, dependency files and instruction files are unchanged. Prior exact-base application and native gates are supplied evidence. No new full Mobile application run occurs in this correction.

## Hosted connection proof and production state

Root separately applied the exact reviewed `20261101042015` worker migration under the user's production authorization. Its identity is preserved. The production history now contains 100 entries. All 154 previous security-definer API-role permissions compare equal. This staged migration is already in both fixed bases; R5 changes no SQL.

For one bounded connection probe, root gave the owned dedicated worker role a new private password and temporarily enabled its login. The unchanged Deno driver connected to the real shared session pooler on port 5432 with the pinned CA and full hostname verification. PostgreSQL returned the exact `companion_push_worker` role and version 17.4. The transaction retained one backend and the configured 2500 ms transaction timeout and 1 s lock timeout. An invalid session was refused. Direct Auth-table reads and a settings write were refused. No business row was changed and no provider request occurred.

The probe did not deliberately trigger a production timeout. Its readback proves the retained backend and accepted timeout values. Prior local deadline tests remain supplied evidence. The username acceptance test is separate from this driver connection probe.

The login was disabled again in cleanup, then verified through a separate hosted read. Feature access, enrollment and dispatch remain false. No Companion Cron exists. All twelve unrelated Cron jobs remain. Deliveries and attempts remain zero. Root retains the password and operator credentials in private storage. They are not in this evidence or the source.

Root confirmed that `unifysocial.ca` is the Cloudflare marketing site and `app.unifysocial.ca` is the Vercel application. Root signed in to the correct Unify Vercel account. A production `COMPANION_PUSH_ENABLED=false` configuration and distinct production and branch-only preview operator secrets are saved. They need a new deployment to take effect. No worker deployment or readiness execution occurred. No IPv4 add-on or billing change occurred. The owned browser tab and REPL are closed.

## Scope and cleanup

Both actual integration branches remain at their bases. Both source code commits preserve those bases. Frozen R3/R4 evidence is unchanged. New logs, counts, diffs, TLS metadata, sanitized driver readback and package inventories are retained here. No live credential, user content or customer row is included. All owned tests and fault processes ended. The root-owned diagnostic cache remains outside the repositories for later cleanup.

The database time-zone correction, actual Vercel execution, provider/device display, physical iPhone VoiceOver, native criterion 8, production binary qualification and release acceptance remain open. The paid IPv4 option is declined. Impeccable remains 3.9.1.

COMPANION_PUSH_SESSION_POOLER_R5_CORRECTION_DONE
