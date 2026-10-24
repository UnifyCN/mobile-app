# Mobile performance pass, 2026-10-24

The final changes reduce repeated data-load time in Learn progress and Checklist. The measured medians fell by 16.3% and 41.1%. Community keeps the original full event query and shared cache. Its earlier four-record optimization was removed because it added a loading state and a full-list request when users opened Events.

## Scope and activity

Measurement base: `21d1cf382ce9d039cf6cd1ed39c146eb7cc80a90`. Measured candidate: `18039b449c741d2384073fa4091735dea7bfc422`. Integration base: `bda1c0cb`. Branch: `perf/mobile-performance-pass`. Both measured versions load application modules from immutable Git commits. All 27 hashes per version match the recorded commit. The three Events production files match the integration base.

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
| Learn progress | 118.63 | 99.33 | 16.3% | 153.59 | 116.91 |
| Checklist data | 124.86 | 73.49 | 41.1% | 216.70 | 89.92 |
| Community data | 370.48 | 391.00 | Control | 594.36 | 527.11 |
| Companion history and usage | 150.19 | 148.43 | Control | 157.19 | 187.93 |
| Social first page | 217.84 | 214.50 | Control | 269.72 | 268.43 |

Community, Companion and Social are unchanged controls. The Community median was 5.5% longer despite identical measured source. Do not attribute these control differences to the changes. The event response is 1,000 records and 1,120,593 bytes in both versions. The QA account has no Companion conversation history, so that row measures the empty-history and usage-read path. It does not measure message generation or a long conversation.

The original baseline was recorded before the production edits. Its Checklist case used the first-months fallback and 19 tasks. The final comparison uses the app's arrival-date normalization and current-stage calculation, with stage 3 and 17 tasks. Do not compare these two Checklist cases directly. The final comparison reruns the pinned base and the candidate in alternating order, with one warmup per variant and 20 measured pairs per flow. It contains 200 measured loads and 880 HTTP responses. Every response has status 200. All five flows have matching output hashes across the variants. Each load records request times, byte totals, row counts and output hashes. The response-inspection cost is included in both variants. Twenty pairs give a bounded sample; p95 values can vary with the network and backend.

The fixture uses English content, the skilled-worker persona, computed stage 3 and British Columbia. It has 15 progress modules, 17 checklist tasks, 14 available groups, 55 news records and 20 posts on the first Social page. Application caches are bypassed or refreshed for these data loads. Hosted caches and connections are warm after the initial pass. The results do not establish warm application-cache performance.

## Changes

- Learn loads account progress and the public catalog at the same time. A failed progress read returns the existing guarded fallback without waiting for the other read. Cache sharing, invalidation, forced refresh and account checks remain covered.
- Checklist loads custom tasks while it loads suggested content and saved progress. It still skips saved suggestion reads when there are no suggested items. Content, completion, dismissal, translation, province and priority results remain the same.
- Community, Events and event detail share the original full query and two-minute cache. The three event cards, View more, search and date/genre filters keep their previous data. Fresh navigation makes no additional event request. The limited-query option and replacement timer were removed.

The Opus P2 finding is corrected by restoring shared complete event data. A rendered regression uses the actual carousel and React Query hook. The list and detail subscribers receive all eight fixture events without a loading state or an additional read. Concurrent subscribers share one read. Both assertions failed on `08de420b` and pass on the measured candidate. The service is mocked in this regression. This verifies cache behavior, not native navigation latency.

The Opus P3 finding is corrected with explicit `baseline_ref`, `candidate_ref`, `checkout_head` and `runner_sha256` fields. Each `source_hashes` entry has a resolved commit. `checkout_head` identifies the checkout at measurement time; it does not identify uncommitted source. The runner no longer measures uncommitted application modules. The initial baseline is a before-only run, so its `candidate_ref` is null. Its old `current_head` key is renamed to `checkout_head` without changing the measurements.

## Checks

The retained regression checks cover parallel reads, early progress errors, account changes, cache invalidation, shared event reads and the rendered View more card. The query-limit and timer tests were removed with that implementation.

The final local checks passed 1,273 main tests plus 13 DST tests, for 1,286 tests. Typecheck and translation parity passed. Lint has no errors and 85 existing warnings. Both native exports passed. Earlier iOS Debug route checks were on `08de420b`; they do not verify this corrected candidate at runtime. Native timing comparison, Android device checks, release-build profiling and physical-device checks remain outside this evidence.

## Evidence and reproduction

- [Initial baseline](initial-baseline.json), recorded before production edits.
- [Final paired comparison](comparison.json), including all samples, response statuses and the 27 base plus 27 candidate module hashes.
- [Production file hashes](production-hashes.json), including the event hook and carousel that the data-loader runner does not mount.
- [Runner](../../../unify-front-end/scripts/performance/mobile-data.cjs).

From `unify-front-end`, use an owned QA account with the same fixture. Store its email and password on separate lines in a private file. Do not use a customer account.

```sh
node scripts/performance/mobile-data.cjs --compare 21d1cf382ce9d039cf6cd1ed39c146eb7cc80a90 --candidate 18039b449c741d2384073fa4091735dea7bfc422 --samples 20 --credentials /absolute/path/to/private-qa-file --output /tmp/mobile-performance.json
```

The runner permits reads, QA sign-in, local sign-out and the existing read-only post metadata RPC. It does not send Companion messages or mutate application data. It uses the app's anon client with the QA session. It does not use a service-role key. No release or hosted configuration change is part of this pass.
