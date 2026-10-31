# #371 local evidence

Read `../../371-profile.md` first. The report separates source, local service, mounted-client, browser and native proof. No artifact grants acceptance.

## Review order

1. `authority-verified.json`, `frontier-current.json`, `code-pins.json`, `source-manifest.json`.
2. `field-map.md`, `mirrors.json`, `fixture-port-adaptations.json`.
3. `gates.json`, `service-suite-summary.json`, `composed-suite-results.json`, `lint-baseline-map.json`.
4. `fault-results.json` and the fault logs. Each injected fault was restored before later gates.
5. `browser/browser-current-final.json` and the eight `profile-{en,ar}-{1280,390}-zoom-{1,2}.png` captures.
6. `resources-before.json`, `resources-after.json`, `preservation-result.json`, `cleanup.json`, `outgoing-scan.json`.

A log name does not establish a pass. Check the exit receipt or the final summary. Failed runs remain. The report identifies assertion failures, setup failures, a fixture correction and the mapped lint baseline.

## Owned local environment

The only project used is `unify-profile-371-r1`. The disposable root is `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-06529381/build/profile-371-r1`. Ports are API 64510, DB 64511, shadow 64512, inspector 64513, worker fixtures 64514-64516, content 3456 and Next.js 3487.

`stage.py` copies the common service, tests, current Companion migrations, rollback files, translations and worker into that root. It retains the web package metadata in the test command directory for the unchanged frozen worker lock. It remaps only the old loopback fixture port literals in disposable test/worker copies. The adaptation manifest records the source and staged hashes. It never modifies the production worker or existing test assertions.

`run.py` checks the DB and REST container names, project labels, physical workdir, running state and Edge content URL before each real-service gate. It reads only this project's local keys into process memory. It does not print them. It removes inherited action overrides and live provider credentials from the test environment. Only the process signal suite receives the broader Deno run permission required for `Deno.kill`; that suite obtains child PIDs from the owned SQL fixture.

The initial start used `ACTIONS_CONTENT_QUERY_URL=http://host.docker.internal:3456/content` before Edge Runtime started. The CLI command was `supabase start --workdir /Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-06529381/build/profile-371-r1/supabase/tests/companion-actions`. The config disables unrelated local products. Each future run needs a fresh ownership and port baseline. Do not reuse the old ledger to take another worker's resources.

## Commands used

From the mobile repository:

- `python3 DOCS/companion-actions/evidence/371-profile-r1/stage.py`
- `python3 DOCS/companion-actions/evidence/371-profile-r1/run.py --preflight`
- `python3 DOCS/companion-actions/evidence/371-profile-r1/suite.py`
- `python3 DOCS/companion-actions/evidence/371-profile-r1/composed.py`
- `python3 DOCS/companion-actions/evidence/371-profile-r1/clients.py mobile-live-final`
- `python3 DOCS/companion-actions/evidence/371-profile-r1/quality.py mobile`
- `python3 DOCS/companion-actions/evidence/371-profile-r1/quality.py web`

The service runner resets only this project between files. It waits for successful REST responses with status and byte counts. Push tests use a local content transport fixture. `composed.py` applies the full current composition including #371 before the selected older behavior suites. Final database gates run in sequence. The report discloses and replaces one overlapped mounted-test/browser-fixture startup. SQL function suites ran in sequence throughout.

`web_server.py` starts only the assigned secondary at `127.0.0.1:3487`. `browser.mjs` drives the actual app, cookie proxy, local Auth and profile persistence. Sanity content and analytics transports are fixtures. The injected installed analytics SDK drops all events before send. The bot filter is disabled only for a binding positive control. The script blocks model calls. The temporary extension changes actual Chrome zoom. Screenshots use viewport capture because full-page capture clips at browser zoom 200 percent.

`faults.py` contains the three deliberate fault probes. It restores the exact SQL definition or source bytes in `finally`. Use its recorded results as historical evidence. A new fault run requires an isolated owned database with the complete profile composition already installed.

`preservation.py` is read-only. It compares complete mount objects, sorted without dropping fields. It allows only this project's resources and the named concurrent native project's lifecycle. Its final mode also requires that all owned resources are absent and assigned ports bind on IPv4 and IPv6.

The Deno CI command, version and all normal gates are in `gates.json` and `tool-versions.json`. Temporary logs have a SHA-256 index. The report lists the native and hosted checks still required.
