# #370 Save and manage approved personal details

Spec: UnifyCN/mobile-app#359. Ticket: #370. Builds on #360-#363 and #366 (accepted, integrated
at mobile `30fa639d` / web `0f6b8209`). Date: 2026-10-27. Composed with accepted #364/#365 on
2026-10-28 (see "Composition with #365" below).

A user can ask Companion to remember one personal detail ("Remember that I can attend
appointments on Fridays"), approve a detail Companion suggests, and view, edit or remove
saved details in the Companion bottom sheet (mobile) or overlay drawer (web). Later answers
read the account's current details; a removed detail is never read again. Province, city,
arrival date and immigration status stay with the profile: they are refused as details.

## What ships

| Part | Where | Notes |
|---|---|---|
| Migration | `unify-front-end/supabase/migrations/20261028004902_companion_saved_details.sql` (CLI-generated); web `supabase/migrations/` byte-identical | Additive. New table `companion_saved_details` (owner, `scope='companion'`, `body`, provenance `source`, `revision`, soft `removed_at`), RLS select-own-live, explicit `grant select ... to authenticated` (new public tables are not exposed by default since the 2026-04-28 Data API change), no client write privilege. Detail functions; proposal kind `detail_create`; new versions of 11 shared action functions that keep each accepted body (#365 for the seven #365 replaced, #366 for the other four) and add marked `#370` lines. Proposal kinds keep #365 `task_edit`. |
| Rollback | `unify-front-end/supabase/rollbacks/20261028004902_companion_saved_details.down.sql`, mirrored | Run before the #365 rollback. Restores the accepted function bodies verbatim (#365, else #366) and the #365 proposal kinds, archives details, detail receipts and detail drafts to `companion_rollback_archive_370`, drops the table. Re-application restores them (drafts need a new review). |
| Endpoint | web `supabase/functions/companion-actions` (`contract.ts`, `commands.ts`, `handler.ts`) | Registry entries `detail.create` (approved_proposal, direct_command), `detail.update` and `detail.remove` (ui_control, approved_proposal), `detail.restore` (approved_proposal only; Undo). `read` adds `details`; `interpret` resolves remember commands; profile facts refused 422 `profile_fact`; `409 detail_exists`. Same endpoint, gate, receipts, status and Undo. No model call. |
| Profile facts | web `supabase/functions/rag-query/lib/context/profileFacts.ts` | Deterministic: places and arrival phrasings from the existing `placeNames.ts` (all app languages), short per-language status lists. Shared by the action service and rag-query. Not a general parser. |
| Answer context | web `rag-query`: `lib/context/{appContext,companionContext,promptBlocks,registry,contract}.ts`, `index.ts` | New read `context.saved_details` (user JWT + RLS), only while the actions gate is on (read with the existing service-role client). Details go to the prompt as quoted data; their text is not in the client `context` object (so not saved into message history). |
| Suggestions | web `rag-query/lib/actions/proposals.ts` | `[REMEMBER]: <detail>` becomes `actionProposal {type:'detail.create', version:1, text}` only when no `[TASK]`/`[STEP]` line exists, exactly one line, plain text, not a profile fact. rag-query writes nothing. |
| Mobile | `services/companionActions/*`, `hooks/companion/useTaskActions.ts`, `hooks/companion/useSendMessage.ts`, `components/companion/tasks/SavedDetails.tsx` (new), `TaskActionCards.tsx`, `TaskActionsSheet.tsx`, `TaskProposalPanel.tsx`, `app/(tabs)/companion/index.tsx` | "Saved details" row at the top of the sheet's task list; detail rows with Edit / Remove; inline confirmation; receipts with revision-checked Undo; dashed draft card + review ("Remember this" / "Not now"); remember-command result card. |
| Web | `lib/companionActions/*` (the mobile files through the web prettier config), `hooks/useTaskActions.ts`, `hooks/useAccountScope.ts`, `hooks/useCompanion.ts`, `services/companion.ts`, `components/companion/tasks/SavedDetails.tsx` (new), `TaskActionCards.tsx`, `TaskActionsDrawer.tsx`, `TaskProposalPanel.tsx`, `app/(main)/companion/page.tsx`, `scripts/verify-companion-saved-details.mjs` | Same behaviour in the overlay drawer; shared `Reveal` motion, `Button`, `aria-disabled` controls, 44px targets. |
| i18n | `savedDetails.*` (55 keys) in ar, en, es, fr-CA, hi, pa, vi on both platforms | Real translations; placeholders checked per key by the insertion script. |
| Telemetry | `companion_action_result` | New actions `detail_change`, `approve_detail`, `command_detail`; `operation_type` is the detail type. Never the detail text or id (tested on both clients). |

### Design decisions (within the reviewed prototype states)

Reused prototype states: "Save a personal detail / Approval needed / Remember this detail? /
Not now / Remember this"; "Saved detail ... You can view, edit, or remove it"; "Remove the saved
preference? ... will no longer be used in later conversations / Cancel / Remove"; receipts
"Changed ... from ... to ..." and "Removed ... It will not be used in later conversations".
Placement follows direction B and the CLAUDE.md layered-UI rule: a row inside the existing
sheet/drawer task list (no new screen or tab). No new visual primitive was introduced; the
existing sheet/drawer, card, confirm-box and button styles are reused. No `/design` pass was
run: no design decision beyond the reviewed states and existing components was needed.

### Composition with #365 (2026-10-28)

The #365 migration (`20261028001530`) is earlier than this one and replaces seven of the
same functions. Applied after it, the original #370 file would have replaced them with
#366 bodies and dropped `task_edit` from the proposal kinds: task edits, edit drafts and
waiting-reason receipts would stop working. The composed file keeps the #365 body of
`companion_validate_operations`, `_check_authorization`, `_apply_one`,
`_receipt_summary`, `_undo_action`, `_cancel_proposal` and `_conversation_actions` (a
3-way merge with #366 as base) and adds the same marked #370 lines; its rollback restores
those #365 bodies and kinds. Order: up #361, #363, #364, #366, #365, #370; down in reverse.
Evidence: `evidence/365-370-composition-r1/README.md`.

### Shared-interface composition (for #364/#365 re-composition)

| Shared function (accepted body) | What #370 adds |
| --- | --- |
| `companion_validate_operations` | `detail.%` → `companion_detail_validate` |
| `companion_check_authorization` | `detail.%` → `companion_detail_authorization` (first line) |
| `companion_apply_one` | `detail.%` → `companion_apply_detail` |
| `companion_receipt_summary` | `detail` object and detail-revision `current` |
| `companion_undo_action` | `detail.%` receipt → `companion_undo_detail` |
| `companion_prepare_proposal` / `_revise_` / `_cancel_` / `_recheck_` | kind `detail_create`; source required; same-text refusal; details lock before context |
| `companion_conversation_actions` | `commands` excludes detail receipts; new `detail_proposals`, `detail_commands` |
| `companion_proposal_context` | `detail.create` case |
| `companion_proposals.kind` check | adds `detail_create` |

Old-client safety: detail drafts and remember receipts are returned in new fields only;
`commands` and `proposals` keep the shapes earlier clients parse. A remember command reaching
an earlier client's `interpret` parser is an unknown kind, so that client answers normally.

### Behaviour rules (tested)

- Authorization: only the user's own saved user message that resolves to exactly the detail
  (one write per message, `companion_command_uses`), or approval of the shown draft revision.
  A direct control never adds or restores a detail; a model flag is ignored; an assistant
  message or another account's message authorizes nothing.
- Ambiguity: "Remember this/that/it" (and the same per language) → clarification; empty →
  clarification; several lines → clarification; over 300 characters → clarification.
- Provenance and owner: account from the JWT; `source` records kind and conversation; read
  returns kind and conversation id only.
- Revisions: edits and removals name the shown revision; a stale or concurrent edit is `409`;
  8 concurrent edits at one revision → exactly one applied.
- Removal: every removal and every Undo that removes (save or restore) needs
  `removal_confirmed`; Cancel sends nothing; a removed detail leaves later context at once.
- Undo: per receipt; after a newer edit nothing changes and a reviewed change is offered;
  approving it is single-use; a second Undo is `already_undone`.
- Duplicates: the same live text is refused (`detail_exists`); a command and an approval of
  the same text, ordered or concurrent, save one detail.
- Retry: same id replays; reused id with another payload refused; held lock → `pending`.
- Clients: typed edits live in the account's action store (close/reopen keeps them); writes
  off offline; account change drops details, drafts and typed edits; analytics categorical.

### Clear-command examples (documented grammar, tested in `details_test.ts`)

| Language | Saves | Asks | Profile fact (refused) |
|---|---|---|---|
| en | "Remember that I need appointments after 5 pm", "Remember: my son starts school in January" | "Remember this", "Remember that" | "Remember that I live in Alberta now", "... I am moving to Calgary", "... I arrive on March 3" |
| fr | "Souviens-toi que je préfère les rendez-vous le vendredi." | | |
| es | "Recuerda que necesito citas por la tarde" | "Recuerda eso." | "Recuerda que soy residente permanente" |
| vi | "Hãy nhớ rằng tôi chỉ rảnh vào thứ Sáu" | | |
| hi | "याद रखें कि मुझे शुक्रवार को समय मिलता है" | | |
| pa | "ਯਾਦ ਰੱਖੋ ਕਿ ਮੈਂ ਸ਼ੁੱਕਰਵਾਰ ਨੂੰ ਖਾਲੀ ਹਾਂ" | | |
| ar | "تذكر أن مواعيدي المفضلة يوم الجمعة" | | "تذكر أن وصولي الأسبوع القادم" |

"Do you remember what I said?" and "I can only do Fridays" are not commands (the answer may
then suggest a detail for approval).

## Evidence

See `evidence/370/README.md` (test order, red/green, faults, gates, logs with sizes and hashes).

## Proof limits

- Server authorization, revisions, receipts, rollback, RLS and isolation: local disposable
  stack only (project `unify-details-370-r1`). No hosted schema, migration, deploy or data.
- rag-query: handler tests with stubbed Supabase/OpenRouter (the gate check and the saved-
  details read are mocked there); the RLS read itself is proven on the local stack through the
  same PostgREST query. No live model: whether a real model writes good `[REMEMBER]` lines is
  unproved; parsing and refusal are tested.
- Mobile rendering: Jest + RNTL; one real-stack case sends real HTTP with real JWTs; the rest
  use the scripted stand-in. No device or simulator run; target sizes are declared styles.
- Web: Vitest/jsdom mounted cases and one headless Chromium run of the real panel and hooks in
  a bundled fixture against the real stack (not the Next.js shell, cards or cookie proxy).
- The profile-fact lists are deterministic and narrow; unlisted phrasings are not detected.
- A writer that bypasses the action service (none exists; clients have no write privilege)
  would not take the details lock.
