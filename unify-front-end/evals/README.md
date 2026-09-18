# AI Companion Eval Harness

Promptfoo-based regression evals for the AI Companion (`rag-query` Supabase edge function): a RAG chat for newcomers to Canada. Hits the deployed edge function with synthetic newcomer profiles, then runs LLM-as-judge rubrics (faithfulness, relevance, safety, personalization, anti-stereotype) plus deterministic checks.

## How to run

1. Install dependencies (one-time):
   ```bash
   npm install -D promptfoo @types/node tsx
   ```
2. Copy env vars and fill in real values:
   ```bash
   cp evals/.env.example evals/.env.local
   ```
   Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `EVAL_BYPASS_SECRET`.

   The bypass secret must also be set as a Supabase Functions secret so the
   deployed `rag-query` function recognizes eval requests:
   ```bash
   # generate a fresh secret if you don't have one
   openssl rand -hex 32

   # set it in Supabase (one-time per project)
   npx supabase secrets set EVAL_BYPASS_SECRET=<paste hex> --project-ref <project-ref>
   ```
   Then put the **same value** in `evals/.env.local` as `EVAL_BYPASS_SECRET`.

   Why a separate secret? `SUPABASE_SERVICE_ROLE_KEY` exists in two formats
   right now (legacy `eyJ…` JWT vs new `sb_secret_…`); a key-equality check
   against the Authorization header would silently fail when the formats
   diverge. The dedicated bypass secret avoids that whole class of bug.
3. Run the suite:
   ```bash
   npx promptfoo eval -c evals/promptfooconfig.yaml --env-path evals/.env.local
   ```
   The `--env-path` flag is required — promptfoo defaults to looking for `.env` in the CWD, not in `evals/`.
4. View the report:
   ```bash
   npx promptfoo view
   ```

## Adding cases

Cases live in `cases/*.yaml`. Each file is a YAML list of test entries. To add a case:

1. Pick (or add) a synthetic profile in `lib/syntheticProfiles.ts`.
2. Add a new entry to an existing case file (or create a new file in `cases/`):
   ```yaml
   - description: "Short human-readable summary"
     vars:
       prompt: "The user message to send"
       profile: { ... onboarding profile fields ... }
       profile_summary: "One-line summary used by judges"
       expected_tailoring: "What good profile-aware behavior looks like"
     assert:
       - type: contains
         value: "PGWP"
       - type: llm-rubric
         value: file://judges/faithfulness.txt
   ```
3. Re-run `npx promptfoo eval` and inspect the diff.

`promptfooconfig.yaml` already globs `cases/*.yaml`, so new files are picked up automatically.

## Tuning judges

LLM judges live in `judges/*.txt`. Each is a plain prompt with `{{output}}` and `{{vars.*}}` interpolation. If a judge is failing too many genuinely good answers (false positives) or letting bad ones through (false negatives):

1. Open the report and find the offending case.
2. Inspect the judge's reason text — it's logged with each failure.
3. Tighten or loosen the rubric in the corresponding `.txt` file.
4. Re-run on the same case set to confirm the new rubric behaves.

Keep judges binary (YES/NO + one sentence). Multi-axis rubrics produce noisier signal.

## Baseline + history (2026-05-09)

Treat these as the watermark — future PRs should not regress them.

| Metric              | 2026-05-09 baseline | After tier-1 prompt + retrieval changes (same day) |
|---------------------|---------------------|----------------------------------------------------|
| Cases passed        | 10/40 (25%)         | **20/40 (50%)** _(+25pp)_                          |
| Latency p50         | 2.3s                | **1.9s**                                           |
| Latency p95         | 8.3s                | **4.2s**                                           |
| anti-stereotype     | 100% (6/6)          | 100% (6/6)                                         |
| faithfulness        | 96% (26/27)         | 96% (26/27)                                        |
| relevance           | 81% (29/36)         | 83% (30/36)                                        |
| personalization     | 48% (23/48)         | **73% (35/48)** _(+25pp)_                          |

A case passes only when every assertion (deterministic + LLM judges) passes — case-level pass rate compounds across 4-6 assertions. Per-judge numbers are the real signal.

**Tier-1 changes that moved the needle (commit `aa994c26`):**
- `buildUserProfileContext` now injects `immigration_status` (was silently dropped) and names `country_of_origin` inside the bias guard
- Vector retrieval embeds `[Context: province, status, persona] prompt`, not the bare prompt — pulls province-specific KB chunks first try
- Province → authority hint table (Ontario/ServiceOntario, BC/ICBC, Quebec/SAAQ, etc.) appended to the immigration system instruction
- Form-help template no longer asks "which form?" when the user's prompt mentions an IMMxxxx number
- Loosened deflection on stable public facts (citizenship test, CRS components, what a SIN is) — model was dodging well-known questions
- Anti-fee-quoting rule + mandatory lawyer/RCIC referral for sensitive intents

**Note on Haiku-judge variance:** the first post-deploy run showed flat aggregate numbers because two borderline cases flipped against the wins. Always run twice when reading small deltas.

## TODO

1. Wire this into CI (GitHub Actions) — gate PRs on regressions in faithfulness/safety pass rate.
2. Add a TTFT (time-to-first-token) assertion now that streaming is live in the edge function — the eval harness currently uses the non-streaming branch (`stream: false`) so this needs a streaming-aware assertion path.

Already shipped (kept for reference):
- `rag-query` accepts `eval_profile` in the request body and gates the bypass on `x-eval-mode: 1` + `x-eval-secret` matching `EVAL_BYPASS_SECRET`. See UnifyCN/web-app `supabase/functions/rag-query/index.ts` (the `isEvalMode` block + the `evalProfile` branch in `profilePromise`).

## Cost note

A full run is ~30 cases. Each case = 1 RAG call (DeepSeek/Gemini, ~$0.0005) + 1-3 judge calls (Haiku 4.5, ~$0.001 each). Total: roughly **$0.05 per full run**. Iterating on a single case is essentially free.
