# Ticket #342: English pre-arrival checklist content

Files:

- `payload.json`: the published records. 5 new `checklist` records and 1 guarded patch.
- `snapshot-before.json`: the live port-of-entry record and a manifest of all 33 English `not_arrived` records, captured 2026-10-24.
- `sources.md`: the official source for each claim, with the page text that supports it.
- `evidence/`: red and green TDD logs, the live dry run, and a negative-control readback.
- Code: `scripts/sanity-before-you-land/content.ts` (pure logic) and `apply.ts` (CLI). Tests: `__tests__/sanity/beforeYouLandContent.test.ts`.

Target: Sanity project of the app Sanity client (`EXPO_PUBLIC_SANITY_PROJECT_ID`), dataset `production`. The project ID is not stored in this public repo.

## Publication

Published on 2026-10-24 UTC after independent content review. The reviewed payload SHA256 is `ff8d51abdeca6bd5a3a11d1ce04ffc1de7123c40fb8190e392cee4247f548036`.

The CLI transaction failed for insufficient create permission and made no changes. The connected Sanity tools then created the five new drafts and the port draft. The port draft used the original published revision as a guard. Complete draft readback matched the payload and preserved the other port fields. All six drafts were published with their exact draft revisions as guards.

After publication, `--verify` passed for all six records. An authenticated read found six published target records and zero target drafts. The same English pre-arrival query returned 38 records, up from 33. All 32 other captured records kept their revisions. A repeat plan returned six no-ops.

This confirms hosted content publication. It does not confirm a native link tap or an app release. The existing port translations remain outside this ticket.

## Review, then apply

```
cd unify-front-end
# 1. Read-only plan. After publication, expect: 6 no-ops.
SANITY_PROJECT_ID=<id> SANITY_DATASET=production npx tsx scripts/sanity-before-you-land/apply.ts
# 2. Write. One atomic transaction.
SANITY_PROJECT_ID=<id> SANITY_DATASET=production SANITY_API_TOKEN=<write token> \
  npx tsx scripts/sanity-before-you-land/apply.ts --apply --confirm-project <id>
# 3. Readback only (read-only), run any time after the apply.
SANITY_PROJECT_ID=<id> SANITY_DATASET=production npx tsx scripts/sanity-before-you-land/apply.ts --verify
```

Guards:

- Dataset must equal `expectedDataset`. `--apply` needs `--confirm-project` and a token.
- New records use fixed `_id` values and `createIfNotExists`. A second run writes nothing.
- The port record is patched with `ifRevisionID`. Only `title` and `description` are set. If the record already holds the target copy, nothing is written.
- A live record that differs from the plan, a missing patch target, or a draft of any target `_id` stops the run before any write.
- The script reads back after the write and exits 1 on any difference. Unrelated fields on the port record are compared with the snapshot.

## Review notes for the parent

Review round 1 fixes (F1 to F4) are in this payload. Excerpts and body hashes for the changed facts are in `evidence-r2/source-excerpts-2026-10-23.txt`. Red and green logs are `evidence-r2/tdd-*`.

1. **Persona targeting decision (F2).** The pet record targets the six persona values of the deployed checklist schema: `international_student`, `skilled_worker`, `immigrant`, `pr`, `refugee`, `protected_person`. It excludes `other`. The schema rule rejects `other` as `value.not-allowed` (level error). Users whose stored persona is `other`, or who have no persona, do not get this pet item. The spec does not require `other` targeting. The app's no-persona query and the existing `other` records are unchanged. A broader legacy `other` or schema change is outside this ticket. The validator now accepts only these six values.
2. **CFIA link (F1).** The schema has no URL field. The link is a bare https URL at the end of the pet description. `TaskDetailModal` now renders the description through `components/checklist/LinkedDescription.tsx`. Each http or https URL is a pressable link that calls `Linking.openURL` with that exact URL. Other schemes stay plain text. Ordinary descriptions render as before. A test presses the real link in the real modal with the real pet record. No device tap test ran. The task detail sheet is the only place the app shows the description. `Learn how` still opens the Companion tab.
3. **Port record (F3).** The document list now has proof of settlement funds with the exemption (`unless you are exempt`). COPR completion and goods-list steps are unchanged.
4. **Health record (F4).** The title and text no longer say IFHP ends when provincial coverage starts. Basic coverage lasts until provincial or territorial eligibility. Supplemental and prescription benefits have separate rules. The text keeps the officer-issued certificate and the instruction to apply for provincial or territorial insurance. It names a provider registered with the IFHP.
5. The 6 existing translations of the port item (vi, es, hi, ar, fr-CA, pa) keep the old meaning ("land at a specific port") and omit proof of funds. After the English rewrite, non-English users see the old text until the translation process runs. This ticket does not translate. This limitation is disclosed, not fixed.
6. New records have no `translation.metadata`. Non-English users see the English copy, which is the existing fallback.
7. The old port-of-entry copy claimed that PR holders must land at a specific port. No IRCC or CBSA page that was read supports that. The new copy makes no claim about which port.
8. The refugee items use `link_tab` links, not module links, because the linked Learn health content is BC-specific.
9. `class_order` for the shared pet item is 7 (`do_soon`). The highest `do_soon` order of any persona today is 6, so no order ties.
10. The three records verified in round 1 (`67c02a10`, `b35d1e3d`, `36c70b31`) are byte-identical to the round 1 payload. The patch still carries `ifRevisionID` `fU1GG1h0UZ892Cv6evsyuZ` and sets only `title` and `description`.
