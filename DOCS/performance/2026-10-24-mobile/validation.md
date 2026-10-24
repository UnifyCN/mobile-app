# Final validation

Measured source commit: 18039b449c741d2384073fa4091735dea7bfc422. Integration base: bda1c0cb. Measurement base: 21d1cf382ce9d039cf6cd1ed39c146eb7cc80a90.

- Full local tests: 118 main suites, 1,273 tests; 2 DST suites, 13 tests. Total: 1,286 tests.
- TypeScript: passed.
- Lint: no errors; 85 existing warnings.
- Translation parity: passed for all 7 locales. No user-facing copy changed.
- iOS and Android exports: passed on the corrected source.
- Historical iOS Simulator checks at 08de420b: Debug build and five routes opened with the QA account. These checks were not repeated on 18039b44. No device or native before/after timing comparison was made.
- Final paired data-loader comparison: 200 loads; 880 HTTP 200 responses; 5 equal output hash sets; all 27 base and 27 candidate module hashes verified.
- Event navigation regression: both cases failed on 08de420b and pass on 18039b44. The rendered carousel and actual hook share a single complete read with list/detail subscribers, both concurrently and after the carousel loads. Three cards and View more remain present. This is controlled React Query behavior with a mocked service, not native timing.
- P2 response: the three Events production files match bda1c0cb. The limited query, separate cache and timer were removed. Final Community event responses have 1,000 rows and 1,120,593 bytes in both variants. No Community speed or payload improvement is claimed.
- P3 response: both measured variants have resolved immutable commit references. The candidate is 18039b44, and the runner SHA-256 matches the report. All response byte totals add up. The initial before-only artifact uses checkout_head and candidate_ref null.
- Prior independent reviews: four Codex rounds passed before the Opus review at 08de420b. That Opus review found P2 and P3. A new correction review is required before these findings are closed.

The artifacts contain aggregate timings and hashes. They contain no access tokens, passwords, customer record bodies or user identifiers. The benchmark uses one synthetic QA account. No release, hosted schema change or production rollout is part of this work.
