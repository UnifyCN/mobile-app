# Preserve unresolved recovery after a storage read failure

R372-1 is corrected locally on both clients. Independent re-check is pending. No integration, push, hosted change or acceptance occurred.

A same-account cleanup could delete a valid unresolved operation after a temporary storage read failure. Reopening the panel then allowed a new approval with a different ID. The cleanup now leaves an unreadable record in place for a later read. Confirmed sign-out still deletes without parsing. Successful reads still remove another account's records. No service, schema, dependency, copy or UI change was needed.

## Fixed code candidates

- Mobile: `a807b6446cc79e682970bdd23ded57a5e0297dad`, tree `45c398d3c7a3d276cc7d1d42bac88bf452faa14b`, branch `t3/companion-recovery-completion-372`.
- Web: `54423880dbd135c2e17b56804239f8997893d847`, tree `c2a77d248f9bd10d1d808eaf4d35db1219f41dad`, branch `fix/companion-release-359-root`.

PINS.json contains paths, parents and source hashes. Later commits add only this evidence and a Web pointer.

## Verification

Falsifier: the cleanup discards the original operation ID, enables a new approval before lookup, or sends a new write. The new mounted regression uses the actual panel, store, recovery adapter and client. Its transport is scripted.

- The unchanged reviewer controls reproduced 10 passes and one assertion failure on each client.
- Each new permanent regression failed before the fix. It observed a replacement operation reference after the enabled approval sent a new write.
- After the fix, Mobile passes all 11 reviewer controls plus the permanent regression. Web passes all 11 reviewer controls and its permanent regression in separate runs.
- The permanent regressions retain the exact original bytes, keep approval disabled, and send result lookup with the original ID. They send no approval.
- Normal Mobile CI exits 0: 1,626 passed, 39 skipped; separate DST stage 13 passed. Normal Web tests exit 0: 840 passed, 18 skipped. Web build exits 0.
- Both type checks pass. Changed-file lint has zero errors and zero warnings. Prior full-Web-lint evidence retains twelve existing errors; it was not repeated for this two-line mirrored correction.

Each result comes from the retained machine-readable results or its exact run log. Counts overlap and are not added. No forceExit was used. CHECKS.json retains command exits and durations.

Original logs remain in `/tmp/unify-companion-359/one-day-delivery-20261031/recovery-read-correction-r1`. Outgoing copies normalize dashes and trailing whitespace. MANIFEST.json retains both hashes and identifies each normalization. No credential-shaped values were found in these new logs.

Temporary reviewer executables were removed. The root started no service, native resource, provider call or child while correcting the defect. Retained resources and old evidence remain unchanged. The correction proves client behavior with controlled storage failures. It does not establish physical storage failure, installed-client restart, native focus, screen-reader, hosted or release behavior. Existing real-service evidence remains supplied proof for unchanged server behavior.

COMPANION_372_STORAGE_READ_CORRECTION_R1_DONE
