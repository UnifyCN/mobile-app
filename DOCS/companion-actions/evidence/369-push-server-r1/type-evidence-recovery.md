# Type evidence recovery

The second gate invocation reused the first push-check log names. The original type failure was fully read through the tool before that invocation. Its error was TS2322 at push_published_test.ts:22:31: the npm SupabaseClient was not assignable to the JSR SupabaseClient because supabaseUrl is protected. The fix creates the handler client with the same JSR package as the handler. No cast or no-check type gate was used. The first command and raw file were overwritten. This record recovers the error from the tool transcript. It is not a retained raw log. Earlier worker type failures and all behavioral failures retain their original raw files. Later gate invocations use separate names.

## Later recovery

The complete first normal type-check log was recovered from the retained tool output of the original cat command. `type-recovery-receipt.json` identifies the exact current-session record, extraction boundary, and output hash. `push-check-first-recovered.log` preserves that complete log segment. The original command JSON and the first frozen-check log were not recovered. Their failing statuses remain in the tool record. This does not turn those failures into passing evidence.
