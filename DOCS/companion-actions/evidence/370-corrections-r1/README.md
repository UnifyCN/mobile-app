# #370 corrections r1: consent, language and native proof

Implementation evidence for S370-1, S370-2, S370-3 and the root T370-1/T370-2 fixes. This is
not ticket acceptance. An independent review must follow.

The final handoff (pins, gates, ledger, limits, cleanup) is `HANDOFF.md` in this folder.

## Contents

- `brief.md`, `resume-brief.md`: copies of the task brief and the Claude Personal resume
  brief. Their READY markers were changed to CONSUMED after the work.
- `root-records/`: the root's red/green records (S370-1 red on both clients, T370-2 red and
  green, web Standards lint and types), copied unchanged.
- `logs/`: every run in order. Large logs are gzipped. Names: `m-` mobile, `w-` web,
  `b-` backend Deno against the local stack, `rq-` rag-query function tests, `n-` native.
- `faults.py`, `faults/`: deliberate faults. Each replaces one source span, runs the binding
  check and restores the exact bytes (SHA-256 compared). `summary.jsonl` is round 1,
  `summary-round2.jsonl` round 2.
- `harness/`: copies of the scripts that ran against this worker's own local stack
  (`unify-details-370-corrections-r1`, API 61531). The originals live in the gitignored
  `build/s370c-stack/` of the web checkout. `browser-370c.mjs` extends the reviewer's
  retained browser check. `native_*`, `v4_forward.py`, `analytics_sink.py` and `maestro/`
  are the native harness.
- `native/`: simulator screenshots (half resolution) and accessibility hierarchy dumps
  (`*.hierarchy.json`: label, bounds in points, value, enabled) for each native step.
- `SHA256SUMS`: manifest of every file in this folder except itself.

## Test order (test-first versus implementation-first)

1. S370-1: root red tests first (`root-records/s370-1-*-red*`, `logs/m-s370-1-red.log`,
   `logs/w-s370-1-red.log`: 7 failed on each client), then the fix (mobile af3c39a5, web
   3a76bd0), then green. Test-first.
2. S370-1 real-service test (mobile local stack, af6fc3e2) was written after the fix.
   `m-localstack-run1` and `run2-debug` are its authoring failures (the setup asked the wrong
   state); `run3` passes. Implementation-first.
3. S370-2 and S370-3: binding tests first (`b-language-red.log`: 3 failed;
   `rq-s370-2-red.log`: 1 failed), then the fix (web a97e21b). Test-first.
4. After the fix, one English case ("I have a work permit appointment on Friday") was added
   to bind the modifier exclusion (web 582c17c). Fault W6 proves it binds.
5. Fault round 1 left three survivors (W2 revision check, W5 and M3 store guard). Binding
   tests were then added (mobile 10d82ded, web 73e1a4b: a newer service revision; the store
   alone). These came after the implementation. Round 2 catches all of them.

## Deliberate faults

All 19 final faults fail on an assertion (not setup, not a crash):

| Fault | What it breaks | Caught by |
|---|---|---|
| W1, M1 | ignore a newer live read | client tests |
| W2b, M4 | drop the revision check | newer-revision case, store test |
| W3, M2b | drop `current_detail` in the client | web client test; mobile real local stack |
| W4 | name the receipt text in the review | web client test |
| W5b, M3b | drop the store's own guard | store tests |
| W6 | drop the English "appointment" exclusion | backend language test |
| W7 | Hindi status without its copula | backend language test |
| W8 | cut Arabic first person | backend language test |
| W9 | save other Arabic attached forms | backend language test |
| W10 | drop the saving/checking loading delay | real browser frame timing |
| W11 | animate keyboard disclosure | client test and real browser |

Round 1 W2, W5, M3 survived (exit 0). Round 1 M2 and M3 local runs crashed in setup (no
`migrate` after `reset`); they do not count. Their round 2 versions are the ones above.
