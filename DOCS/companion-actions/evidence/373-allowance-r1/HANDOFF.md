# Companion #373 local implementation

Local code is committed in both assigned checkouts. The existing six-per-UTC-day allowance and premium exemption remain. No production, provider, push, PR, ticket or release state changed. No child ran. The root owns independent review and activation.

## Candidates

| Repository | Path | Branch | Code commit | Code tree |
| --- | --- | --- | --- | --- |
| Mobile | `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-387adb29` | `t3/companion-allowance-one-day-delivery` | `6e218ad0285f70e961106fa33add3d2f8bfa5095` | `85853794b54dcd0de34450454531514efd452d4a` |
| Web | `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-release-359` | `fix/companion-release-359-root` | `a75747bc0f7a9bbe8684b19992fdf7ce4a11f007` | `007293cab3367762f3aaa672e690ff5fc2083a13` |

Mobile started clean at `fc33670c0c1f0ac6e2b8a99b9a5a38d96ef04d9f`, tree `3bdb75a875db67ab81d8fe90479d35041a98d6c4`. Web started clean at `35e5f1ac1b89a72411e37d16ed5bcd250fbc5c62`, tree `448e5af96aeac30f182d6941d6f08dce4ec67e30`. The prepared Mobile checkout and the exclusively transferred Web checkout were the only source write locations. No new checkout was made. The integrated #372 recovery history remains. Canonical integration checkouts were not written.

The following Mobile commit adds evidence only. The following Web commit adds an evidence pointer only. The final response supplies those final transfer heads. `PINS.json` records the exact code commits, trees and source-file SHA-256 values. Normal CI, build, types and lint cover the final product source. The mounted local checks preceded the final time-zone display option and private-cache cleanup-list addition. The final normal suites cover those additions. The service test received a type-only capture annotation after its passing runtime check.

## Changes and policy

`get_chatbot_allowance()` reads the existing `chatbot_usage` and `users.is_premium` through a parameter-free authenticated RPC. The server derives the owner from `auth.uid()`. It returns usage, six-message allowance, remaining amount, premium status, server observation and the next UTC reset instant. Premium remaining is null. Auth, network and malformed-response errors do not become a fresh counter. The new read has an empty search path, explicit owner validation, no anon execution and authenticated execution only.

Both clients use account and epoch query keys. Private-account cleanup removes allowance reads. They invalidate after successful and failed sends. Main Web Companion and in-lesson Web help use the same server metadata. Mobile has one current Companion generation consumer; no separate Mobile in-lesson generation caller exists in this checkout. Both clients display the server reset in the selected locale with the local time-zone name. All seven locale files have real translations.

The Mobile composer stays editable at exhaustion. It can still send a deterministic command through the existing authenticated interpretation boundary. The server retains its atomic generation check. No action, approval, reminder, lookup or Undo uses that generation check. Failed sends restore typed text without replacing a newer draft. Web main and lesson failure paths also retain text. Existing navigation, sheets, drawers, motion and domain storage remain.

The new CLI-generated migration `20261101024721_companion_allowance_and_cohort.sql` adds the read and an optional UUID account cohort to the existing service-owned feature gate. The empty default keeps a disabled gate closed. The action service retains normal Auth, version, platform and operation checks. RAG applies the same cohort to new context and proposals. Other accounts retain legacy answers and profile grounding. Mobile requests with the existing `mobile` platform label map to the existing allowed native platforms. Old schemas without the new column retain the normal enabled/disabled behavior. The ten deployed action migrations are byte-for-byte unchanged. New migration and rollback bytes match across both repositories. `MIRRORS.json` contains the hashes. Old quota RPC signatures and mutation permissions are unchanged.

The existing generation event now excludes private message and answer bodies. The measurement response adds logical generation count, configured reasoning effort and provider-reported model identity. The old `model` field can contain a configured fallback; `resolvedModel` exists only when the provider returned the identity. No model, provider, embedding or retrieval routing changed.

## Fresh checks

A wrong result would include another successful generation above the free cap, a failed generation retaining its slot when the refund succeeds, a client-derived reset, another account's usage, an action blocked by generation exhaustion, a lost draft or focus target, or private text in an analytics payload. The checks used public requests, observable persisted outcomes and rendered controls that can expose these failures.

| Boundary | Fresh result | Evidence |
| --- | --- | --- |
| Real local Auth, Postgres, RAG handler, action edge runtime and driver | 9 passed | `logs/service-local-5.log.gz` |
| Mounted Web at exhausted allowance | 1 passed; 14 unrelated cases skipped | `logs/web-local-1.log.gz` |
| Mounted Mobile at exhausted allowance | 1 passed; 23 unrelated cases skipped | `logs/mobile-local-1.log.gz` |
| RAG context, embedding, stream, plain and concurrent regressions | 157 passed | `logs/rag-regressions-final.log.gz` |
| Web focused allowance, draft and funnel cases | 20 passed | `logs/web-focused-cleanup.log.gz` |
| Mobile focused allowance, large-text and context cases | 32 passed | `logs/mobile-source-mobile-focused-final.log.gz` |
| Final Mobile saved-detail fixture checks | 18 passed | `logs/mobile-source-mobile-details-green.log.gz` |
| Normal Mobile CI | Main 1,629 passed, 40 skipped; DST 13 passed; exit 0 | `logs/mobile-ci-normal.log.gz` |
| Normal Web tests | 844 passed, 19 skipped; exit 0 | `logs/web-test-normal.log.gz` |
| Normal Web build | Exit 0 | `logs/web-build-normal.log.gz` |
| Mobile, Web and affected edge types | Exit 0 | `logs/*types*.gz` |
| Both translation parity checks | Exit 0 | `logs/*i18n*.gz` |
| Changed-file lint | No new errors; Web no warnings; Mobile 32 prior warnings | `logs/*changed-lint*.gz`, lint comparison files |
| Full Web lint | The exact twelve initial errors remain in unchanged files | `logs/web-lint-comparison.json.gz` |

The normal client checks cleared all inherited `ACTIONS_` variables. Jest exited normally. No forceExit was used. Do not add overlapping focused and normal test counts to make a larger total. `CHECKS.json` preserves commands and exits, including failed runs.

The concurrent cap test sends four authenticated requests at count five in one run. The status distribution is one 200 and three 429 replies. One answer generation occurs and the persisted count is six. Another test forces an actual controlled provider failure and reads the refunded slot. The UTC test reads a previous-day row and the server reset instant. Premium generation succeeds above six. Authenticated and anon mutation attempts remain refused. The cohort test keeps the global gate off, permits its listed account, rejects another account's action, and verifies a legacy RAG answer outside the cohort. Task state, receipt lookup and Undo work at exhaustion with zero model calls. Rollback preserves the old quota signature.

The mounted checks read real local allowance metadata and operate the real persisted task controls through the same JWT boundary. Their existing allowance-hook/transport stand-ins remain. Separate service-reader tests cover metadata validation and late-account rejection. Web asserts focus remains in the open drawer. Native test rendering does not establish physical focus or geometry.

## Measurements and funnel

The ready-to-run driver is `scripts/measure-companion-sessions.py` in Web and `unify-front-end/scripts/measure-companion-sessions.py` in Mobile. See the committed `373-allowance.md` for runtime inputs. Use a fresh disposable synthetic account for each invocation. The normal authenticated user ID must match `COMPANION_SYNTHETIC_USER_ID`. Credentials and endpoints are runtime inputs. The local driver check used actual HTTP, Auth and owned persistence, with the real RAG handler behind a loopback test proxy and controlled external providers. It completed planning, task help, a saved conversational edit, receipt lookup and Undo.

`MEASUREMENTS.json` is local controlled evidence. Its logical model request distribution is planning 2, task help 1, deterministic edit 0, recovery 0. The extra planning request is the existing guidance search. Its generation-endpoint request distribution is 1, 1, 0, 0. Provider retry attempts remain unavailable. Resolved model is `controlled/model`; model tier is the explicit `controlled` test label; configured effort is off. Frequency, scope, HTTP status, body size and latency are recorded. The answer cost `0.0001` is a fixture value. Every measured-provider session cost is null. Embedding/search cost is unavailable, so total session cost is unknown. No fixture cost is presented as measured provider cost. Generated-answer usefulness remains for root review.

`373-funnel.json` maps the existing categorical action event to review-needed, approval success, progress, lookup/resume and conflict/recovery stages. `373-funnel.hogql` is an inspectable read-only template. Root must bind the interval and explicit team/test distinct-ID exclusions. First-action dates define new/returning cohorts. Platform uses existing captured platform/OS/library fields and remains unknown when absent. The schema test drops private messages, task titles, reminder notes and saved details. The generation-handler test also verifies that analytics has no input or output bodies. Review-needed is not a screen-impression metric. Lookup is not a retention claim. No hosted analytics edit or query ran.

Proposed decision: preserve six per UTC day and the premium exemption until real provider evidence supports a change. Keep the current model routing and reasoning setting. Report model tier, effort, request frequency and request scope together. Zero unauthorized writes and zero duplicate writes remain mandatory stop conditions. A numerical total-cost budget or different allowance cannot be evidence-based from these local fixture costs. Root must set those decisions after the real provider measurements. This package enables no new numerical values and claims no retention or growth improvement.

## Reused evidence and failures

The supplied production-introspection snapshots establish the current policy and permissions. They were read, not refreshed through a hosted connection. The already integrated #372 evidence remains evidence for unchanged action-domain transaction, recovery, reminder and account behavior. Those historical campaigns were not all repeated. No passing local check is treated as hosted, provider, device or release evidence.

Failed controls and setup logs remain in the evidence package. Initial setup used a nonexistent content-stop export; this import error is summarized here because its first raw log was overwritten before the numbered log scheme. The next setup attempt exposed the Postgres driver's explicit-transaction rule. The test now uses a connection transaction with the migration wrapper removed. The content runner needed `--node-modules-dir=none`. The first controlled generation fixture used a non-greeting prompt without an embedding stand-in; the corrected content fixtures preserve real Auth and persistence. These setup failures did not exercise production.

The initial Web service test failed because the client read quota rows. It then passed through the server RPC. The first mounted Web fixture selected a radio as a button. The corrected test uses its real role. Existing RAG fixtures needed explicit platform/gate metadata and allowance measurement fields excluded from unrelated client snapshots. The local measurements exposed the extra guidance model request; the report now counts it instead of assuming one model call per turn. New service-test lint errors from two `any` casts were removed; full lint then returned to the exact original twelve errors.

Normal Mobile CI first exposed an obsolete disabled-composer assertion. The updated test checks server allowance text and an editable composer. A saved-detail fixture then checked historical card count before the second rendered answer completed. It now waits for the enabled Send control and the rendered second answer, then checks both cards. Its failed runs, diagnostic run and passing file remain. No private-domain behavior was changed to satisfy those tests.

## Cleanup, review and root work

Only project `unify-allowance-373-r1` was started. API, DB, shadow and inspector ports were 65080-65083. Content used 3514. The driver briefly used an OS-assigned loopback proxy port and closed it in finally. The named DB/REST labels were checked before SQL. The existing #372 `readyProfile`/`readyPush` setup supplied the missing push_tokens fixture before the unchanged push and profile migrations.

The owned containers and volumes were removed. The content process was stopped. All five fixed ports are free. The temporary config is restored exactly. Copied function sources were removed before build and lint. No global Docker restart or prune occurred. The Android worker's guest, SDK, processes and ports were not touched. `CLEANUP.json` records the result. Raw logs stay on local disk. Outgoing logs have credentials redacted and contain synthetic fixture data only. `MANIFEST.json` records raw and sanitized hashes. `OUTGOING_SCAN.json` records the credential scan.

STANDARDS self-review found no new documented-standard failure. Mobile lint has no added diagnostics and removes one unused-variable warning. SPEC self-review covers the local implementation boundaries above. No independent review ran because children were prohibited. The root must independently review both code candidates, stage the migration and code, qualify hosted Auth/permissions and the cohort, run actual provider measurements, bind analytics exclusions/cohorts, select any numerical cost/launch thresholds, complete iOS/Android/browser accessibility and input qualification, and make the joint release decision. Ticket and release acceptance remain open. No push, PR edit, production write, live provider/analytics call, paid service, provider change or acceptance action occurred.

COMPANION_ALLOWANCE_373_IMPLEMENTATION_R1_DONE

PR https://github.com/UnifyCN/mobile-app/pull/376, code candidate 6e218ad0285f70e961106fa33add3d2f8bfa5095; PR https://github.com/UnifyCN/web-app/pull/192, code candidate a75747bc0f7a9bbe8684b19992fdf7ce4a11f007; bounded local checks pass with unchanged lint limits, independent review pending, not pushed.
