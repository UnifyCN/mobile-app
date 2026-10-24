# Mobile performance pass, 2026-10-24

The changes reduce repeated data-load time in Learn progress, Checklist and Community. The measured medians fell by 17.4%, 40.6% and 45.2%. Community event data fell from 1,000 records and 1,120,593 bytes to four records and 5,527 bytes. The three displayed cards and the View more state match the base.

## Scope and activity

Base commit: `21d1cf382ce9d039cf6cd1ed39c146eb7cc80a90`. Branch: `perf/mobile-performance-pass`. The source changes are commit `463d3df5`, rebased on `bda1c0cb`. All 27 measured candidate module hashes still match after the rebase.

Live [PostHog activity](https://us.posthog.com/project/250953) selected the five main tab flows. The 28-day window is September 26 through October 23 in America/Vancouver. The seven-day window is October 17 through October 23. UTC bounds are explicit, so both windows contain full local days. Final query readback matched these counts.

| Area | Views, 28 days | Users, 28 days | Views, 7 days | Users, 7 days |
| --- | ---: | ---: | ---: | ---: |
| Learn | 1537 | 252 | 336 | 103 |
| Checklist | 786 | 126 | 175 | 46 |
| Community | 425 | 111 | 109 | 38 |
| Companion | 244 | 96 | 51 | 34 |
| Social / ForYou | 417 | 94 | 98 | 25 |

The filter requires the React Native SDK and a physical-device flag. It excludes the five configured internal emails and one known QA email. Platform tags are absent on much of the older traffic, so they are not required. Person filters use ingestion-time properties. Unidentified internal activity can remain. Users can appear in more than one area. Screen views show visits, not successful content loading. [PostHog screen event documentation](https://posthog.com/docs/libraries/react-native#capturing-screen-views).

## Before and after

These measurements run the actual application data loaders in Node on macOS against live hosted data. They do not measure native rendering, frame rate, app launch, memory, physical-device latency or production results after release.

| Data load | Before p50, ms | After p50, ms | Median reduction | Before p95, ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Learn progress | 123.88 | 102.27 | 17.4% | 136.51 | 125.30 |
| Checklist data | 124.96 | 74.26 | 40.6% | 149.04 | 78.66 |
| Community data | 402.40 | 220.50 | 45.2% | 793.90 | 267.67 |
| Companion history and usage | 159.39 | 152.67 | 4.2% | 365.74 | 183.95 |
| Social first page | 216.68 | 218.92 | -1.0% | 492.99 | 409.65 |

The Companion and Social code did not change. Their small time differences are control variation. The QA account has no Companion conversation history, so that row measures the empty-history and usage-read path. It does not measure message generation or a long conversation.

The original baseline was recorded before the production edits. Its Checklist case used the first-months fallback and 19 tasks. The final comparison uses the app's arrival-date normalization and current-stage calculation, with stage 3 and 17 tasks. Do not compare these two Checklist cases directly. The final comparison reruns the pinned base and the candidate in alternating order, with one warmup per variant and 20 measured pairs per flow. It contains 200 measured loads and 880 HTTP responses. Every response has status 200. All five flows have matching output hashes across the variants. Each load records request times, byte totals, row counts and output hashes. The response-inspection cost is included in both variants. Twenty pairs give a bounded sample; p95 values can vary with the network and backend.

The fixture uses English content, the skilled-worker persona, computed stage 3 and British Columbia. It has 15 progress modules, 17 checklist tasks, 14 available groups, 55 news records and 20 posts on the first Social page. Application caches are bypassed or refreshed for these data loads. Hosted caches and connections are warm after the initial pass. The results do not establish warm application-cache performance.

## Changes

- Learn loads account progress and the public catalog at the same time. A failed progress read returns the existing guarded fallback without waiting for the other read. Cache sharing, invalidation, forced refresh and account checks remain covered.
- Checklist loads custom tasks while it loads suggested content and saved progress. It still skips saved suggestion reads when there are no suggested items. Content, completion, dismissal, translation, province and priority results remain the same.
- Community requests the first four events inside the existing four-month window. It displays three cards and uses the fourth record to keep View more. Full-list and detail callers keep the full query and a separate cache. The limited cache expires by the first event start. It schedules replacement reads, retries after failures and clears its timer on unmount.

## Checks

The regression checks first failed on the previous behavior. They cover parallel reads, early progress errors, account changes, cache invalidation, exact event date boundaries and tie order, full-list cache isolation, card replacement, failed replacement recovery, long timer deadlines and the rendered View more card.

The final local checks passed 1,279 main tests plus 13 DST tests, for 1,292 tests. Typecheck passed. Lint has no errors and 85 existing warnings. Both native exports passed. The independent production-code review passed after the corrections. The local iOS Debug build succeeded. Learn and Community opened with the QA account. A native service call returned four future events. Native timing comparison, Android device checks, release-build profiling and physical-device checks remain outside this evidence.

## Evidence and reproduction

- [Initial baseline](initial-baseline.json), recorded before production edits.
- [Final paired comparison](comparison.json), including all samples, response statuses and the 27 base plus 27 candidate module hashes.
- [Production file hashes](production-hashes.json), including the event hook and carousel that the data-loader runner does not mount.
- [Runner](../../../unify-front-end/scripts/performance/mobile-data.cjs).

From `unify-front-end`, use an owned QA account with the same fixture. Store its email and password on separate lines in a private file. Do not use a customer account.

```sh
node scripts/performance/mobile-data.cjs --compare 21d1cf382ce9d039cf6cd1ed39c146eb7cc80a90 --samples 20 --credentials /absolute/path/to/private-qa-file --output /tmp/mobile-performance.json
```

The runner permits reads, QA sign-in, local sign-out and the existing read-only post metadata RPC. It does not send Companion messages or mutate application data. It uses the app's anon client with the QA session. It does not use a service-role key. No release or hosted configuration change is part of this pass.
