# Push service correction review handoff

COMPANION_PUSH_369_SERVICE_CORRECTIONS_READY_FOR_REVIEW

Review only the corrections to 369-SPEC-01, 369-SPEC-02 and 369-STD-01, plus direct regressions from those corrections. Keep separate SPEC and STANDARDS verdicts. The final root packet records the exact candidate heads and trees after this evidence commit. This handoff does not approve any stage or ticket.

## Source locations

| Repository | Worktree | Branch | Code commit |
| --- | --- | --- | --- |
| Mobile | `/Users/savargupta/.t3/worktrees/Unify/t3-56bad9ac` | `t3/companion-reminder-service-369` | `4561c1255ba5090f58cfb658f22164f43acff0db` |
| Web | `/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root` | `fix/reminder-standards-368-r1-root` | `805484e8c064fad3b8ab762b0d70a6d9749ba9da` |

The correction bases are mobile `ac4d8e4776346a324199ac63a5214c0e2f3b2d2b` and web `ce22b10959711d7459a8d23b4ceee801be237b71`. The integrations remain at mobile `19c2d0d6ea9d7b90d1bb0b10ae345cf6f2cbe83c` and web `623179cee615057de2c20c8c6216e192891dab4b`. Their checkouts remain clean. Both integration tips are ancestors of the candidates.

## Results and limits

- Both complete runs pass 68 of 68 cases. They use the same 311 recorded runtime inputs. There is no manual reset between them. The existing recovery cases retain their own required rollback and reapply operations.
- Each run records 29 loopback provider-fixture requests. There is no real provider call.
- The original defects fail before their fixes. The three additional faults fail binding assertions. Five additional ordering/expiry tests were written after the SQL fix. They are not test-first evidence.
- The normal and separate frozen Deno compiler gates pass. The runtime suite's no-check flag is not used as compiler proof.
- The selected repository ESLint gate passes, with its existing worker exclusion warning. The extra default Deno lint result remains failed and is explained in the README. New tests pass the explicit pinned-import lint command. No lint rule or dependency was changed.
- The local advisor result retains 41 warnings and two fixture-table RLS errors. No result names the new private helper. Direct helper execution is false for anon, authenticated and service_role.
- All 18 SQL mirrors match. The rollback is unchanged. The prior implementation evidence is unchanged.
- Cleanup removes only the root-owned project. The frozen record verifies 33 protected identities/states and full mount contents, 18 volume names, seven nondefault networks and 14 IPv4/IPv6 port binds. The first raw array comparison failed on list order. The default bridge changed inside the captured engine-start interval. Both facts remain explicit. Strict network identity stays false.

Read `type-record-exception.md` in full. The first command JSON and frozen type-failure log were not recovered. The root authorizes a limited exception to its earlier preservation requirement. A fresh Standards verdict must assess this exact disposition. No reconstructed raw evidence is offered.

## Read and rerun

`README.md` gives the finding map, falsifiers, proof boundaries, setup failures and test order. `summary.json` is machine-counted. `runtime.py` starts only `unify-push-369-correction-r1`. It records all test commands and exact runtime inputs. It is a root-owned example, not permission for a reviewer to reuse that project or canonical roots.

A reviewer must use its own prepared checkout and its own project and ports. A readonly web export at the exact candidate is permitted. Adapt local paths and project identity before running. Keep the worker's loopback fixture ports and strict fixture-token checks. Check the original nine push test files plus the new isolation and authority-race files. The old R1 report and independent reproductions remain available unchanged.

No mobile notification registration, native SecureStore, device routing or permission UI was added. Those are the next implementation stage after this service correction passes. Native criterion 8, hosted configuration, real provider delivery, tickets 367/370/368/369, and release qualification remain separate and open. Impeccable stays at 3.9.1.

The reviewer must create a new report in its own checkout. It must not edit either source, either integration, the canonical state file, old reports, protected Docker resources, native data or instruction files. The root will record the result and consume this handoff after reading the complete report.
