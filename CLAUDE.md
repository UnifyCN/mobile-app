# Project: Unify

React Native / Expo project.

## Skills

- Always apply `vercel-react-native-skills` when working on React Native components, screens, navigation, animations, lists, or UI/performance code.
- **Frontend design:** Always invoke BOTH `frontend-design` AND `ui-ux-pro-max` skills together when changing any UI.

## UI patterns: prefer layered compositions over full screens

When designing any new feature or sub-task, **default to layered, in-place UI** before reaching for a new full screen. iOS HIG favors spatial continuity — pushing the user to a new screen is cognitively expensive ("out of sight, out of mind") and breaks flow, especially for short sub-tasks.

Try, in roughly this order:

1. **Bottom sheets** (`components/common/BottomSheet.tsx`) — for forms, pickers, confirmations, secondary actions
2. **Contextual menus / action sheets** — for choices tied to a specific item
3. **Inline expansion** — reveal details/forms in place rather than navigating away
4. **Popovers / tooltips** — for small bits of info or quick actions
5. **Progressive disclosure** — show more only when asked

Only push a full screen when the task genuinely warrants taking over: deep multi-step flows, immersive content (post detail, chat, learn module), or destinations the user navigates to intentionally (tabs, profile).

When in doubt, ask: "Is this a sub-task of what the user is currently doing, or a new destination?" Sub-tasks → layered. Destinations → screen.

## Internationalization

The app supports multiple languages (currently en, vi, es, hi, ar, fr-CA, pa) and the list keeps expanding. Treat i18n as a hard requirement, not an afterthought.

When making ANY change that touches user-facing text — UI copy, alerts, button labels, error messages, placeholders, accessibility labels — follow these rules:

- **Never hardcode user-facing strings.** Use `t()` from `useTranslation()`.
- **Locale files live at `unify-front-end/i18n/locales/{lang}/translation.json`.** List the directory first (`ls unify-front-end/i18n/locales/`) — don't assume the locale set, new languages get added regularly.
- **Add every new key to ALL locale files in lockstep.** Provide a real translation per locale, not English copy-pasted everywhere.
- **Translations are nested by feature namespace** (e.g. `companion.welcomeTitle`, `auth.signIn`). Place new keys in the right namespace.
- **Before deleting a key**, grep the codebase (`grep -rn "namespace.keyName"`) to confirm no callers remain in any source file.
- **When renaming a key**, update all locale files in the same commit so they stay in sync.

## Commits

When committing, only stage files relevant to the change. Skip unrelated modifications (e.g. package-lock.json, build.gradle) unless they're part of the feature.

## Backend

- Supabase edge functions are in `unify-front-end/supabase/functions/`
- Moderator notification emails go to `contact@unifysocial.ca` via Resend API
- Legal documents are hosted on Notion — URLs are in `unify-front-end/utils/legalUrls.ts`

## iOS builds and releases

Use the `app-store-release` skill — it holds the full procedure. Two traps worth
knowing before you touch a build:

- **`unify-front-end/app.config.js` is the Expo config** (not `app.json`), and
  `expo.version` there is the canonical store version. `package.json`'s version
  is ignored by Expo and has drifted before.
- **`unify-front-end/ios/` is gitignored**, so no `Podfile.lock` is committed and
  every EAS build re-resolves CocoaPods. A transitive pod release can break a
  build whose code did not change. To reproduce such a failure locally you must
  delete `Podfile.lock` first — plain `pod install`, even with `--repo-update`,
  keeps the locked versions and proves nothing.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- Release to the App Store, new version, OTA update, TestFlight → invoke app-store-release
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint → invoke context-save; resume → invoke context-restore
- Code quality, health check → invoke health
