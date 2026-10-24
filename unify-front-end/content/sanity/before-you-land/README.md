# Ticket #342: English pre-arrival checklist content

Files:

- `payload.json`: the proposed records. 5 new `checklist` records and 1 guarded patch.
- `snapshot-before.json`: the live port-of-entry record and a manifest of all 33 English `not_arrived` records, captured 2026-10-24.
- `sources.md`: the official source for each claim, with the page text that supports it.
- `evidence/`: red and green TDD logs, the live dry run, and a negative-control readback.
- Code: `scripts/sanity-before-you-land/content.ts` (pure logic) and `apply.ts` (CLI). Tests: `__tests__/sanity/beforeYouLandContent.test.ts`.

Target: Sanity project of the app Sanity client (`EXPO_PUBLIC_SANITY_PROJECT_ID`), dataset `production`. The project ID is not stored in this public repo.

## Review, then apply

```
cd unify-front-end
# 1. Read-only plan. Expect: 5 create, 1 patch.
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

1. The 6 existing translations of the port item (vi, es, hi, ar, fr-CA, pa) keep the old meaning ("land at a specific port"). After the English rewrite, non-English users see the old claim until the translation process runs. This ticket does not translate.
2. New records have no `translation.metadata`. Non-English users see the English copy, which is the existing fallback.
3. The Studio persona list does not contain `other`. Live records and the app use `other`. The pet record includes it so that `other` users can see it. Studio may show a validation warning on that record.
4. The schema has no URL field. The CFIA link is plain text in the description, so it is not tappable in the app.
5. The old port-of-entry copy claimed that PR holders must land at a specific port. No IRCC or CBSA page that was read supports that. The new copy makes no claim about which port. It says only that the COPR is presented at a Canadian port of entry before its Valid to date.
6. The refugee items use `link_tab` links, not module links, because the linked Learn health content is BC-specific.
7. `class_order` for the shared pet item is 7 (`do_soon`). The highest `do_soon` order of any persona today is 6, so no order ties.
