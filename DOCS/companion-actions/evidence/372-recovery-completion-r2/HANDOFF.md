# Companion #372 recovery completion

Local implementation is complete in the two assigned worktrees. The prior completed Mobile candidate and its six recovery tests are preserved. No ticket, PR, provider, production or release state changed. No child ran. Independent review remains with the root.

## Candidates and ownership

| Checkout | Branch | Code commit | Code tree |
| --- | --- | --- | --- |
| `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-469783ed` | `t3/companion-recovery-completion-372` | `88c00f07cc522c4bb25445cbeb06ed494cd6a1da` | `8df8908ceb5c6cf62a06eb7df1ad223d9b8cc7a2` |
| `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-release-359` | `fix/companion-release-359-root` | `8758991d2697195b73c6cf878518ab45d7ce8850` | `6b05fd3a22faac16dca49d0738689ffe8aa8efce` |

Mobile started clean at `df25938fcfd10202fe92bb3524accf01110079ce`, tree `0570a14f744ba3a8b9190892eb7c8a4f6c1ac258`. I read the prior candidate diff, then merged `51ee7477727d5605a9fa2fe9ec35845283e184ab` with `--ff-only`. The prior evidence directory is unchanged. Web started clean at `222daf983fcb15c7667a66ba3a513e4f04f38f7a`, tree `e4f96b9040c242a28fc910cc2b89b20d489070d5`. The root transferred that existing checkout exclusively. No other checkout was created or written.

The following Mobile commit adds evidence only. A following Web commit adds a pointer only. Use the final reported heads for transfer. The exact code commits and trees above contain all product and test changes. `SOURCE_MANIFEST.json` records their file hashes. `MANIFEST.json` records raw and outgoing evidence hashes. The brief SHA-256 is `640a504080d541dee60bcfa376778e364b0fe96ce2ea7c18e7b6e0ca8c7890d1`.

## Changes

Both clients now keep a small account-owned operation reference before sending a plan approval, retry or Undo. Mobile uses existing AsyncStorage. Web uses localStorage. The record contains operation IDs, proposal IDs/revisions and receipt references. It contains no task text, raw operations or message content. The store blocks writes while it loads. A restored record permits lookup only. After confirmed not-applied, an explicit apply retry re-reads the server proposal. A changed revision returns to review. An unchanged retry keeps the original operation ID. Storage failure blocks the write. Nothing executes automatically after reconnect or restart.

Storage work is serialized. Account checks guard reads and writes. Account-generation changes discard the prior in-memory store. A request captures its account-bound client before it waits for storage. Cleared stores ignore late results. Confirmed account replacement and sign-out clear durable references. The Mobile root Auth consumer also clears them when no plan screen is open. A null user plus an Auth error preserves recovery.

Both saved plan panels now read excluded additions from the original applied server proposal. Each excluded addition uses the existing translated exclusion message. All seven real translations of the failure sentence now name only failed work. Existing saved rows, partial receipts and per-operation conflict panels remain. The public one-operation action contract, services, schema, policies and reminder runtime guards are unchanged. No dependency or lockfile changed. Impeccable remains 3.9.1.

## Checks and freshness

A false result would include a second write while lookup is unresolved, a changed operation ID, a repeated successful addition, an excluded task saved or reported failed, a newer edit overwritten by Undo, a lost draft, or private recovery state returned to another account. The rendered controls and real persisted outcomes can detect these conditions.

| Check | Result | Evidence |
| --- | --- | --- |
| Mobile full local client file | 22 passed, 1 stage-only restart skipped | `logs/mobile-local-final.*` |
| Mobile affected recovery cases after the generation guard | 7 passed | `logs/mobile-recovery-candidate.*` |
| Mobile two-process restart | Create 1 passed; separate resume process 1 passed | `logs/restart-create-final.*`, `logs/restart-resume-final.*` |
| Web full local client file | 13 passed, 1 stage-only restart skipped | `logs/web-local-final.*` |
| Web two-process restart | Create 1 passed; separate resume process 1 passed | `logs/web-restart-create-final.*`, `logs/web-restart-resume-final.*` |
| Normal Mobile CI | Main 1,625 passed, 39 skipped; DST 13 passed; exit 0 | `logs/mobile-normal-candidate.*` |
| Normal Web tests | 839 passed, 18 skipped; exit 0 | `logs/web-normal-candidate.*` |
| Mobile final test-import check | 10 passed, 23 local cases skipped | `logs/mobile-final-imports.*` |
| Both types and translation parity | Exit 0 | `logs/mobile-types-final-imports.*`, `logs/web-types-candidate.*`, `logs/*-i18n.*` |
| Changed-file lint | Mobile 0 errors, 16 prior warnings; Web 0 errors/warnings | `logs/*-lint.json`, Mobile baseline comparison |
| Full Web lint | 12 prior errors; exact diagnostics match; all affected files unchanged | `logs/web-lint-baseline-comparison.json` |
| Web final build | Exit 0 | `logs/web-build-final.*` |
| Retained Web disclosure/motion checks | 4 passed | `logs/web-rendered-movement.*` |

The full Mobile local file ran before the final account-generation refinement. Its seven affected recovery cases and the two-process restart ran again after that refinement. The retained cases did not require another service-domain campaign. The final Mobile test changes only replaced require-style imports with equivalent existing imports; types and the two affected test files were checked again. The final Web edit added `role=status` to the exclusion text after the local-stack run; its build, changed-file lint and retained rendered disclosure tests passed after that edit. There was no later domain-behavior change.

All normal runs cleared every inherited ACTIONS variable. Local runs explicitly named the DB and REST containers. Jest exited without `forceExit`. Do not add overlapping runs to make a larger passing count. `CHECKS.json` and the individual test-result JSON files retain their exact sets and exits.

## Failures retained

- `excluded-red`: the test first expected an excluded result in the initial plan receipt. The service intentionally records the exclusion in its applied proposal. The corrected control reads the actual receipt distribution.
- `excluded-render-red`: the binding rendered failure. The saved panel omitted the excluded library addition.
- `restart-resume-red`: the binding second-process failure. The client lost the original unresolved operation and offered approval again.
- `auth-read-red`: the first global cleanup version discarded recovery after a null-user network error. The corrected implementation preserves it until a confirmed Auth event.
- `web-results-first`: a test used `Undo this plan`; the real translated control is `Undo plan change`.
- `web-core-first`: a test looked for `aria-checked` on a native HTML checkbox. The corrected assertion reads its checked state.
- `web-offline-first`: the fixture created a draft before opening a saved plan. The existing entry correctly gives drafts priority. The fixture now creates that draft after the saved-task checks.
- `types-mid`: an initial runner invocation accidentally sent a TypeScript command to Jest. The runner mode was corrected. Actual TypeScript checks passed.
- `cleanup-bind-control`: the first plain socket bind met TCP TIME_WAIT. There was no listener. The corrected SO_REUSEADDR bind confirmed all owned ports were free.

These are test/setup controls except the two rendered gaps and the first Auth cleanup defect. Raw logs remain in ignored `tmp/372-recovery-completion-r2`. Outgoing logs redact local credentials and normalize em-dashes. Both hashes are retained. The prior worker's evidence remains unchanged.

## Runtime cleanup

Only disposable project `unify-recovery-372-r2` was used. API/DB/shadow/inspector ports were 65060-65063. Content used 3512. All chosen ports were free before startup. Port 65077 was occupied and was not used. The committed Web harness was copied into the assigned Mobile checkout. It served the assigned Web source with the required content URL. The corrected prior push_tokens baseline fixture was applied before the unchanged push and profile migrations. Setup succeeded without another helper project.

DB and REST project labels were verified before SQL. Only the owned project and content process were stopped. Its containers and volumes are removed. All five used ports are free. The temporary harness and copied service/migration source were removed before build and lint. No global Docker restart or prune occurred. No retained runtime was changed. See `logs/ownership.json`, `logs/harness-source-manifest.json` and `logs/cleanup-final.json`.

## Review and proof limits

See `REQUIREMENT_MAP.md`. STANDARDS self-review found no new documented-standard violation. Existing Mobile lint warnings and Web full-lint errors remain separately identified. SPEC self-review finds the three assigned local implementation requirements covered by the recorded boundaries. No independent review ran because children were prohibited. The root owns that review and integration.

The primary service used real local Auth JWTs, the actual action handler and real Postgres persistence. Model output, content, generation allowance, navigation and native APIs retained the existing stand-ins. Web rendering used jsdom. Mobile rendering used React Native Testing Library. Restart used two separate test processes with a file-backed native-storage stand-in or copied jsdom storage bytes. It did not restart an installed iOS, Android or browser client. Native storage behavior, native focus, screen readers, browser zoom/resize, push delivery, hosted permission behavior, ticket closure and release acceptance remain separate. Storage-failure blocking was source-reviewed; no physical storage failure was induced.

The four outcomes use existing per-item plan results, applied proposal exclusions and per-operation conflict receipts. No artificial batch endpoint or four-state batch response was added. User-excluded work is not labelled as a server failure. No production write, push, PR/issue edit, native operation, live model/provider/analytics call, paid service, provider change or acceptance action occurred.

COMPANION_372_RECOVERY_COMPLETION_R2_DONE

PR https://github.com/UnifyCN/mobile-app/pull/376, code candidate 88c00f07cc522c4bb25445cbeb06ed494cd6a1da; PR https://github.com/UnifyCN/web-app/pull/192, code candidate 8758991d2697195b73c6cf878518ab45d7ce8850; bounded local checks pass, prior lint limits remain, independent review not run, no push.
