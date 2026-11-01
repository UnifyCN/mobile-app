# Mobile recovery evidence for #372

The core Vancouver journey passes against real owned local Auth, the actual action service and Postgres. Six new rendered recovery cases pass. No product change was needed. Full #372 remains open. This handoff grants no acceptance.

## Pins and scope

- Worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-836b2497`.
- Branch: `t3/mobile-core-journey-recovery`.
- Start commit: `df25938fcfd10202fe92bb3524accf01110079ce`.
- Start tree: `0570a14f744ba3a8b9190892eb7c8a4f6c1ac258`.
- Tested code commit: `0fbf9fdc3c40e6971c203550fef5ff7983b89c97`.
- Tested code tree: `931e88d942258f8f52d49c1b933747d9eba8a264`.
- The following evidence-only commit contains this handoff. Use the final reported HEAD to select both commits. It has the same test and product bytes as the tested code commit.
- Brief SHA-256: `1292cfbd7a1e1a086841c97635964fb338d3512c187626385648400f6bdcff92`.
- Authority SHA-256: `04ee80d3d49ed6bf17c858eb3443b832d42283110b14e781a7f7df940cda885f`.
- Canonical Mobile and Web heads, trees and clean status remain unchanged. See `logs/canonical-final.json`.
- Impeccable remains 3.9.1. No dependency, instruction, UI, translation, schema, service or policy file changed.
- No child, provider change, additional checkout, push, PR edit, device, hosted write or production action occurred.

## Changes

`unify-front-end/__tests__/companionActions/planLocalStack.test.tsx` contains six new cases. They reuse its account, SQL, request, mount and control helpers. The Auth stand-in now returns a null session and user after sign-out. Its foreground test restores the original AppState function without resetting the existing Jest mock implementation. No existing assertion was removed.

The other new files are in this evidence directory. `shared-results-repro.py` preserves a public-contract limitation for the root. `MANIFEST.json` lists the complete new logs and their hashes. `CHECKS.json` records the final check counts and exits.

## Fresh checks

| Check | Result | Limit |
| --- | --- | --- |
| Retained local inventory, plan and action files | 21 passed, exit 0 | Before new tests; real local service and persistence |
| Final changed local file | 21 passed, 0 skipped, exit 0 | 15 retained cases plus six new cases |
| Normal `npm run test:ci` | Main: 1,623 passed, 37 skipped; DST: 13 passed; exit 0 | All ACTIONS variables cleared |
| `npm run typecheck` | Exit 0 | Includes the new tests |
| Changed-file ESLint | Exit 0, 0 errors, 13 existing warnings | Warnings are in retained lines |
| Shared result reproduction | Expected failure, exit 1 | Two operations: HTTP 422; single-operation control: HTTP 200 |

Jest exited without `forceExit`. The real lock holder also exited normally. Test-result JSON files retain the individual names and outcomes. Do not add the overlapping test runs to produce a larger test count.

## Runtime and setup recovery

Only project `unify-one-day-recovery-372-r1` was used. API: `127.0.0.1:65040`. Related ports: 65041-65043. Content stand-in: 3510. All chosen ports were free before setup. Container project and workdir labels were checked before SQL. Both container variables were explicit.

The existing Web harness ran from an ignored copy in this worktree. Its only config substitutions were the project and ports. The content URL was `http://host.docker.internal:3510/content`. The harness copied the pinned canonical service into the owned fixture. The canonical harness was never executed.

Stack startup passed. Migration setup then failed once because the disposable baseline lacked `public.push_tokens`. One targeted recovery used the existing `pushSupport.ts` baseline fixture, then the unchanged push and profile migrations. Recovery and the service control passed. See `logs/migrations.stderr`, `logs/setup-recovery.*` and `logs/setup-service.*`. No alternate runtime was built.

The historical reminder and profile local-stack files were read. Their exact old guards remain unchanged. They were not run with this runtime's variables. The new journey reaches their production components through the existing Companion screen.

The owned project, containers and volumes were removed. The content process stopped. All five owned ports are free. No committed config needed restoration. See `logs/cleanup-final.json`.

## Failures retained

- The setup migration failure above was a fixture prerequisite failure.
- `journey-1`: the test tried to type while the composer was disabled. The test now waits for the enabled composer.
- `journey-2`: the zone appeared in more than one correct result; the test also interrupted reconciliation before it cached the saved state. Both test preconditions were corrected.
- `typecheck`: the AppState listener test used `string` instead of `AppStateStatus`. The test type was corrected.
- `partial-1`: the test used a nonexistent `plans.retries` response field. It now checks the real retry receipt through `plan_status`.
- The combined journey runs exposed AppState test cleanup that reset the existing mock implementation. `render-diagnostic` records the exact `sub.remove` failure. The test now restores the original function. No product guard was weakened.
- `shared-results`: the authenticated public endpoint rejects a two-operation request before writes. Its successful single-operation control and persisted rows exclude an Auth or local-stack setup failure.

Raw originals remain in the ignored `tmp/372-one-day-core-r1` directory. Outgoing logs contain credential redactions. The manifest records both raw and outgoing hashes. These are new logs, not copied historical archives.

## Root action and proof limits

See `REQUIREMENT_MAP.md`. Individual saved and failed plan additions pass. Conflicts and changed-context approval pass separately. A single journey result that displays saved, failed, conflict and not-attempted operations remains unproved.

The public `apply` parser accepts exactly one operation. Two otherwise valid independent state changes return HTTP 422 `invalid_operations`; the first succeeds alone in the control. The reproduction proves this contract restriction. It does not prove that batching is the only correct product design. The root must resolve the required result contract and provide a binding path for the four states. Mobile must not invent a result or change the shared service from this task.

The dropped-response case proves failed lookup cannot write again, then resolves the receipt before restarting. The new mount reads the same persisted plan and receipt. Restart while lookup is still unresolved is not separately proved by this case. Do not use the passing saved-state restart as that proof.

Native input, native focus, screen-reader operation, push delivery, Web rendering, hosted permissions, ticket closure and release acceptance remain unproved. Rendered node identity and modal properties are local evidence only. No independent review ran because the user prohibited children. The root owns new-change review and all integration decisions.

Self-review: STANDARDS has no new source violation. SPEC is partial for the open items above. Source and authored evidence pass the whitespace check. The full evidence diff reports whitespace from captured stdout/stderr. Those logs retain their original whitespace and are excluded from the source whitespace check.

COMPANION_372_ONE_DAY_CORE_JOURNEY_R1_DONE
