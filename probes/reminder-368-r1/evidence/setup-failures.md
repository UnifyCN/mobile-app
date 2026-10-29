# Setup failures

1. The first stage command requested the absent web path `messages`. `git archive` exited 128. The runtime directory was empty. No container, schedule or account existed. Classification: setup failure, unresolved at that point. No behavior verdict follows. The corrected stage command uses the tracked web locale path found by `git ls-tree`.

Reference lookups also found that the current shared service lives in the web repo, and the #360 decision lives in root `DOCS`. The old mobile probe README paths do not identify the merged service.

2. The first behavioral run hit an ambiguous `kind` variable in the local barrier trigger. Real Cron runs failed with PostgreSQL error 42702. The due wait reached its deadline. This is a harness/setup failure, not assertion RED and not a scheduler product defect. `barrier-setup-error.txt` retains the exact error. The run was stopped. The barrier variables now use `v_ref` and `v_kind`. The next run uses fail-fast to prevent dependent cases after a setup fault.

3. The second run passed the concurrent retry, actual Cron due and owner checks. It then tried to update `cron.job` directly. The local database denied that table write. This is a setup/API-use failure, not assertion RED. The test now uses the supported `cron.alter_job` function. This denial also shows why local scheduler table access must not be assumed to prove hosted permissions.

4. The third run passed both completion race orders and the separate failure checks. The removal test passed the response envelope as approval instead of its nested `proposal`. The service correctly refused it with HTTP 403. The lock wait deadline then expired. This is a test-driver failure, not assertion RED. The test now consumes `response.proposal`, as the merged removal tests do.

5. The fourth run passed all four race orders, explicit cancel, old retry and reopen checks. The zone test compared postgres.js `Result` objects, including driver metadata. It failed although both epoch/zone row values matched. The assertion now compares plain row values. This is a test-driver assertion error, not a valid behavior RED. The fold values in that run were 1825565400 and 1825569000.

Log copies remove credential lines and trailing whitespace. They retain the setup errors and assertion output. The final behavioral run is `green-attempt-5.log`. The earlier attempt filenames identify chronological runs; they do not claim those runs passed.
