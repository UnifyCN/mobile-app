# #362 mobile: Companion context and official guidance

Spec #359, ticket #362. Server side and web client: UnifyCN/web-app branch
`feat/companion-context-362`, `docs/companion-context-362.md` (handler,
guidance search, local RLS probe and the `messages.companion_context`
migration all live there with `rag-query`).

## Mobile change

- `utils/gemini.ts`: the streamed `metadata` event carries `context`.
- `hooks/companion/useSendMessage.ts`: the live bubble shows the parsed
  context while the answer streams. The raw version-1 object is saved with the
  answer. It is never passed to analytics.
- `services/companion/saveMessage.ts`, `getConversationMessages.ts`: write and
  read `companion_context`. If PostgREST reports the column missing (migration
  not applied), they retry without it, so chat keeps working.
- `helpers/companion/companionContext.ts`: allowlist parser (same contract as
  web `lib/companionContext.ts`). It accepts only plain https links, drops
  unknown kinds and versions, clamps and strips control characters, and gives
  no check time to a page that was not read.
- `components/companion/ContextSummary.tsx`, `CompanionContextSheet.tsx`
  (direction B): a context line under the answer (place, arrival, Checklist
  task count, when official pages were read, notices in words) and a "Sources
  and context" bottom sheet. Focus returns to the control on close. Links use
  #2B5A9B (6.9:1 on white; Theme.surfaceBlue is 3.9:1). Notices are text plus
  an icon. Addresses stay left to right in RTL. Strings are translated in all
  seven locales (`companion.context.*`; links reuse `companion.openInBrowser`
  as the hint).

## Evidence (local, 2026-10-25)

| Check | Result |
| --- | --- |
| `__tests__/companion/companionContext.acceptance.test.tsx`: real `useSendMessage`, `streamGeminiAPI`, SSE parser, `saveMessage`, `getConversationMessages`, `formatMessagesForUI`, `MessageWithSources`, fed the exact rag-query stream pinned by the web handler test. Stubbed: expo/fetch, the Supabase client (in-memory, no RLS), analytics, usage, the sheet animation and icons. | 9/9 pass |
| Same test before the implementation (HEAD `962c516f`) | Written first. 6 fail on assertions (no live or saved context, no control, no notices). 3 guards pass: analytics privacy, older server, unmigrated column. |
| `__tests__/companion/companionContextSheet.test.tsx`: Arabic, hostile text and link schemes, unread pages, failed reads, arrival conflict, missing province, focus return | 7/7 pass. Written after the sheet. |
| Mutations (each reverted) | Dropping the live context fails 1 test; not saving it fails 5; reopening without the column fails 5; no unmigrated fallback fails 1; any link scheme fails 1; no focus return fails 1; no publisher fails 1; no unavailable notice fails 2. Forcing a check time onto a failed page in the sheet is equivalent, because the parser already removes it. |
| Full Jest (`__tests__`, in band) | 124 suites, 1326 pass, 2 skipped (pre-existing) |
| `tsc --noEmit`, `check-i18n`, eslint on new files | pass (only warnings are `require()` inside `jest.mock` factories, the repo's existing test pattern) |
| `expo export --platform ios` | Hermes bundle builds and contains the new strings |

## Not proven

- No simulator or device run. The hosted rag-query does not return `context`
  until the web branch is deployed and the migration is applied, so a native
  run against hosted data would show only the older-server path.
- The fixtures here are copies of `web-app/supabase/functions/rag-query/fixtures`.
  The handler test there fails on drift. These copies must be refreshed by
  hand.
- Server authorization, RLS and isolation are proven only in the web repo
  (controlled handler tests plus a local Supabase probe). The mobile tests stub
  the Supabase client.

## Review corrections (2026-10-25)

Branch `t3/companion-362-review-corrections`, from candidate `838d7da2`.
Web branch `fix/companion-context-362-corrections` holds the server and web
corrections and their evidence (`docs/companion-context-362.md`, "Review
corrections").

- Spec review r1 finding 6: the sheet's Close control was 44 x 44 with no
  hitSlop, below the Android 48dp minimum. Close is now 48 x 48 and each
  source link is at least 48 tall. The new test in
  `__tests__/companion/companionContextSheet.test.tsx` checks the declared
  size plus hitSlop of the context-line control, Close and both links. It was
  written first and failed on `838d7da2` (Close height 44). Now 8/8 pass, and
  the acceptance suite 9/9. This is the declared layout in Jest, not a
  measured target on a device.
- The server corrections (denied-conversation details, Checklist province
  rule, planning questions in every supported language) change what
  rag-query returns, not the mobile client. The pinned fixtures did not
  change: the web handler test still matches them.
- The web drawer findings (account change, access loss, focus after an
  update) do not apply to the mobile sheet in the same way: each sheet
  belongs to one answer and unmounts with it. No mobile account-change or
  native focus test was run; this stays unproven on a device.

## Review corrections, round 2 (2026-10-25)

Spec review r2 findings are in the web branch (`docs/companion-context-362.md`,
"Review corrections, round 2"): rag-query uses earlier turns only when the
conversation read succeeds, reads stated places and arrival times in every
supported language and script, and the web drawer makes the page behind it
inert. No mobile source changed in round 2. The mobile client sends the
conversation id it created, so the stricter server rule keeps its history.
The pinned rag-query fixtures did not change (the web handler test still
matches them). The mobile sheet's background behaviour for screen readers
(`accessibilityViewIsModal`) was not measured on a device.
