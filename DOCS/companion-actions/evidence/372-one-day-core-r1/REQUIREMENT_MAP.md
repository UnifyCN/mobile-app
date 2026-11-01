# Requirement map

All pass results below are local rendered-client and real-persistence evidence. They do not grant platform or release acceptance. The primary seam is the authenticated public action service. The mounted layer uses the actual Companion screen and bottom sheet. Model output, content, generation allowance, navigation and native APIs use the existing test stand-ins.

| Requirement | Evidence | Result and boundary |
| --- | --- | --- |
| Reuse SIN and bank; approve only missing phone task | New `keeps one Vancouver plan` case; retained draft/exclusion case | Pass. One custom task; stable existing references; no task before approval |
| Approved personal and profile context | New core case | Pass. Explicit remember command and reviewed arrival change persist through real service calls |
| Step does not complete parent | New core case; retained step/completion cases | Pass. Checked step, Not started parent, then explicit Waiting state |
| Waiting reason, reminder and stable identities after remount | New core case | Pass. Same plan, task, step and reminder IDs; Waiting reason and checked step render after remount; named Vancouver zone persists |
| Dropped response after commit; failed lookup cannot write | New dropped-approval case | Pass. Server returns 200 and SQL sees the task before the response is dropped; failed lookups keep approval disabled; one write and receipt |
| Pending lookup cannot write | New held-operation-lock case | Pass. Real Postgres operation lock; public lookup returns pending; approval stays disabled; no task or receipt before release |
| Confirmed not-applied retry keeps identity | New lock case and task retry case | Pass. Real public status permits retry after absence is confirmed; operation identity remains unchanged |
| Overlapping requests do not duplicate work | New task retry case | Pass. Two simultaneous HTTP requests return applied/replayed; one revision and one receipt |
| Partial independent success survives; retry only failed work | New partial case | Pass. Full result distribution is reused, reused, failed, created; retry has one result with the original failed item ID; the successful task row is byte-identical |
| Saved, failed, conflict and not-attempted displayed individually in the complete result | `shared-results-repro.py`, `logs/shared-results.*`; separate retained conflict cases | Open. Saved/failed additions and conflicts pass separately. No binding four-state result proof. Two-operation public `apply` requests are rejected |
| Changed relevant context requires new approval | Retained relevant-profile retry and revised-review lost-reply cases, run fresh | Pass. Old approval writes nothing; current context appears in a new review; exactly one task after approval |
| Offline stale label, blocked writes, reconnect refresh | New offline case | Pass. Controlled network failure labels the cached view stale; presses write nothing; foreground reconnect reads an authenticated edit from another device |
| Other-device removal disables stale controls | New offline case; retained removal-card case | Pass. Public reviewed removal; refresh disables completion controls; no new write after a stale press |
| Exact-receipt Undo preserves newer work | New offline case; retained removal/Undo cases | Pass. Undo names the original operation ID; current conflicting revision and reason survive |
| Account switch and sign-out clear private work | New offline case; retained account isolation cases | Pass. Another real account reads only its own seeded tasks; private sheet and composer clear; local logout returns 204 |
| Composer draft and mounted controls survive updates | New core, dropped-response and partial cases | Pass for enabled composer input, panel updates and close. Waiting radio and reason input retain node identity. Native focus remains unproved |
| Recovery after a restart while outcome is still unknown | New dropped-response case | Partial. Failed lookup is tested; receipt resolves before restart. Restart with the outcome still unresolved remains unproved |
| Direction B, navigation, translations | Source unchanged; rendered bottom sheet/modal in new core case | Existing behavior reused. No new product copy. New tests use English. Full locale and platform qualification remain open |
| iOS, Android and Web together | Supplied integrated prerequisite and CI records; no new product bytes | Retained scope. This task establishes no native, Web, hosted or release acceptance |

The six new tests are grouped in `planLocalStack.test.tsx` under `372 complete recovery journey against owned persistence`. Existing helpers and assertions remain. The old reminder and profile runtime guards remain exact.
