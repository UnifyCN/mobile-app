# Push whole-deadline correction R4

R3-SPEC-01 is corrected in code. One scoped independent review is required. No ticket, native criterion, hosted operation or release is accepted.

Mobile: /Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-33359ffe, branch `fix/companion-push-whole-deadline-r4`. Code HEAD `7df4f030c1e0fd7da15462f9e11e6186b91dbd43`, tree `760e7060643eb789b78ac0ddbd1cae81d6c73352`, parent `b141d1944f427e1a5d4832b699eb1448fb9b9e1b`.
Web: /Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-release-359, branch `fix/companion-push-whole-deadline-web-r4`. Code HEAD `60bbf6ced98b99a423788301768b9b8a53b2b251`, tree `a44ca33358c16fc60054a188a89e4875a7becbba`, parent `da2260ab7ea858ad91b9280d1f565cb27159428d`.
The Mobile evidence commit above this code adds only this report folder. The Web code head is also its final head. Resolve the final Mobile wrapper with Git. The old R3 branches remain at their exact source commits.

## Change

The authenticated HTTP handler races the complete preparation, process and cleanup task against the shared deadline and request cancellation. It returns HTTP 504 at the deadline or HTTP 499 after client cancellation. It releases the busy guard at that response. It checks the same signal before preparation stages and before process creation. Recursive copying checks the signal for each entry. The task retains ownership of late-created directories and removes them after pending file work settles. Its cleanup wait cannot extend the HTTP response deadline.

The worker, supervisor, SQL grants, TLS, request authorization, environment allowlist, retry and unknown-intent rules are unchanged. The two runtime source mirrors match. The change touches only the adapter, its new deadline test, and the worker README in each repository. All migration and rollback bytes remain unchanged.

## Falsifiers and evidence

A pending HTTP response after the shared deadline, a new process after cancelled preparation, a retained busy flag, or a late temporary directory that remains after work settles would fail this correction.

The permanent test calls the actual public HTTP handler. It copies the three application modules without source changes and controls only filesystem timing, the clock factory and the OS process boundary in a separate Node process. It uses real local files for package verification, copying and cleanup. The runtime bytes and process are synthetic. The existing process-tree tests separately use real pinned Deno descendants.

The four stalled filesystem cases failed before the fix at the intended deadline assertion. All four pass after the fix. The additional request-cancellation case was written after the fix. It passes. The second authenticated request succeeds while the first file operation is still pending, and late work starts no process. No owned test directory remains.

The reviewer's exact control has only one path substitution to keep its temporary files in the owned R4 folder. Its 115,000 ms verification delay and real 110,000 ms deadline are unchanged. It now returns HTTP 504 at 110013.676 ms. The deadline event occurred at 110010.522 ms. Its normal process exit is 0. The original failed R3 record remains unchanged. This is a local orchestration control, not hosted Vercel evidence.

Two faults in owned copies are caught: removing the whole-task race, and removing the cancellation checks. Both fail at behavior assertions. The canonical source is not mutated by these fault runs. The temporary copies are removed. The complete diffs and logs remain.

## Final checks

- Node reports 15 passing tests and zero failures. That includes one parent test, four stalled filesystem subtests and the request-cancellation case. It also includes the nine prior Node controls. Counts are not summed again.
- Web normal suite: 847 pass, 19 skip. Normal build, TypeScript and locale checks exit 0.
- Mobile normal TypeScript exits 0. The prior Mobile application tests, DST tests, native exports and both unchanged SQL suites are reused. No Mobile UI, native or SQL source changes in this correction.
- ESLint exits 0 with two warnings that these worker MJS files are ignored by the existing configuration. This is not lint coverage of those files. Node loads and executes the changed JavaScript. The supplied full-Web baseline still has twelve earlier errors; it was not rerun for this worker-only change.
- Fresh complete local traces pass package checks. Dispatch is 107,841,951 bytes. Readiness is 107,842,015 bytes. Each has 785 files, all 635 required entries, and executable mode 0755. Tests, host caches and environment files are excluded. Managed Vercel packaging and execution remain unproved.
- Source whitespace passes. The three changed worker files match across Mobile and Web. No dependency, manifest, instruction, feature gate or Cron changed.

The owned Node checks ended. Their process-tree tests removed all descendants. The real-delay fixture and both deliberate-fault copies were removed after completion. No Docker, native, provider, deployment, push, PR, integration or production operation was part of this correction. Root's separately authorized production database update remains a distinct operation.

The source R3 review approved STANDARDS and reported no other code finding. It requested only R3-SPEC-01. Its report is `/Users/savargupta/.t3/worktrees/Unify/t3-36f38537/DOCS/companion-actions/evidence/review-push-native-release-r3/REPORT.md`. The next review must check the open finding and changed code only. Native criterion 8, physical VoiceOver, managed Vercel execution, hosted delivery and historical infrastructure gaps remain open. Impeccable remains 3.9.1.

COMPANION_PUSH_WHOLE_DEADLINE_R4_CORRECTION_DONE
