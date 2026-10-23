---
name: app-store-release
description: Ship a new Unify iOS version to the App Store, or push an Expo OTA update to the live iOS and Android builds. Use when the user says "release", "ship an update", "new version", "push to App Store Connect", "submit to Apple", "TestFlight build", "OTA update", "eas update", "cut a release", "bump the version", or asks whether a change can go out over the air. Handles the full path: preflight, OTA-vs-binary audit, version bump, quality gates, EAS build, EAS submit, GitHub release, and App Store Connect follow-through.
metadata:
  version: 1.0.0
---

# Unify — App Store Release

Ship an iOS update. Two paths exist and picking the wrong one either wastes a
20-minute build or crashes every user on the live binary. Run the audit in
Step 1 before you touch anything.

An OTA (Step 2A) reaches **both** the iOS and the Android production binaries.
New Android binaries go through Google Play, which this skill does not cover;
the binary steps (2B onward) are iOS-only.

**All commands run from `unify-front-end/`.** Nothing in this skill works from
the repo root.

## Repo facts you must not re-derive

| Fact | Value |
|---|---|
| Expo config | `unify-front-end/app.config.js` (NOT `app.json`, NOT `app.config.json`) |
| Canonical store version | `expo.version` in `app.config.js` |
| `package.json` version | **Ignored by Expo.** It has drifted before. Never read it for the store version. |
| Build number | Managed by EAS (`appVersionSource: "remote"`, `autoIncrement: "buildNumber"`). Never hand-edit. |
| Runtime version | `exposdk:55.0.0` |
| EAS project | `3772d4d9-79dd-4848-9691-bae1b19eefb8`, owner `unifysocial` |
| Bundle id | `com.anonymous.unifyfrontend` |
| App Store app | `Unify - Canada Newcomer Guide`, `ascAppId` `6754875762`, Apple Team `BA3JQQ8HVQ` |
| Listing localizations | `en-CA`, `en-US` — both need "What's New". The 4 in-app locales (en/es/hi/vi) are unrelated to the store listing. |
| Update channel | `production` (build profile `production` → channel `production`) |
| Tag format | `vX.Y.Z` |
| GitHub release title | `iOS App Version X.Y.Z` |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` is already set — App Store Connect will not ask. Do not remove it. |

## Step 0 — Preflight (blocking)

Run `scripts/preflight.sh`. It must pass before anything else. It checks:

1. `npx expo config --json` evaluates. **This is the highest-value check.**
   Every EAS command (`build`, `submit`, `update`, `build:version:get`) shells
   out to it first, and when it fails EAS prints a bare
   `expo/bin/cli config --json exited with non-zero code: 1` with no cause.
   The usual cause is stale `node_modules` after a dependency change — a plugin
   listed in `app.config.js` is not installed. Fix with `npm install`, then
   re-run. Catching this here costs 5 seconds; missing it costs a failed build.
2. Working tree is clean and the branch is `main`, synced with `origin/main`.
   A release must be reproducible from a pushed commit.
3. `.env` exists (`app.config.js` calls `dotenv` at eval time).

If a check fails, fix it and re-run. Do not proceed with a dirty tree.

> The Bash sandbox swallows stderr from `expo config`. If you get an empty
> error, re-run that one command with `dangerouslyDisableSandbox: true` to see
> the real message.

## Step 1 — OTA or new binary? (the audit)

The two live binaries were built from different commits, so audit each one.
`<base>` is the commit of the live binary:

- **iOS:** the last tag, `git describe --tags --abbrev=0` (e.g. `v1.6.0`).
- **Android:** builds are not tagged. In Play Console, read the versionCode
  live on the production track. Find the build whose `appBuildVersion` equals
  it in the output below and take its `gitCommitHash`. If
  `git cat-file -e <commit>` fails (the build came from a squash-merged branch),
  use the squash-merge commit on `main` instead (versionCode 12 was built from
  `e4c4dd54`, merged as `6a32cbdf` in PR #310).

```bash
npx eas-cli@latest build:list --platform ios --limit 3 --non-interactive
npx eas-cli@latest build:list --platform android --limit 3 --non-interactive --json
```

Run this block once per platform, with that platform's `<base>`. The paths are
repo-root paths, so keep `git -C ..`: from `unify-front-end/` without it, the
pathspecs match nothing and the audit falsely reports no native change.

```bash
git -C .. log --oneline <base>..HEAD
git -C .. diff --name-only <base>..HEAD -- \
  unify-front-end/app.config.js \
  unify-front-end/package.json \
  unify-front-end/ios unify-front-end/android
git -C .. diff <base>..HEAD -- unify-front-end/app.config.js unify-front-end/package.json
```

A native change for one platform only (the `android` block or `android/`
files; the `ios` block or `infoPlist`) blocks the OTA for that platform only.
Run Step 2A with `--platform ios` or `--platform android` for the unblocked
platform, and ship the blocked one a new binary.

**Any one of these forces a new binary. OTA cannot deliver them:**

- A dependency with native code added, removed, or upgraded — including a
  package that only *looks* like JS. `react-native-*`, `expo-*` and anything
  with a config plugin all ship native code.
- A change to the `plugins` array in `app.config.js`.
- A new or changed permission / `infoPlist` string / URL scheme.
- An Expo SDK bump. This changes `runtimeVersion`, so the OTA would reach
  **zero** devices — silently. There is no error.
- App icon or splash screen changes (baked into the binary).
- Any `app.config.js` field read at build time (`name`, `bundleIdentifier`,
  `ios`, `android`, `scheme`, `runtimeVersion`).

**OTA is safe only for** JS/TS, styles, copy, i18n JSON, and runtime-loaded
assets (images that source files `require()`, e.g. `assets/images/partners/*`).

State the verdict plainly, then **stop and get confirmation before running
anything.** Both paths are outward-facing and neither is reversible.

## Step 2A — OTA path

Only after Step 1 says OTA is safe.

```bash
for p in ios android; do
  npx eas-cli@latest update --branch production --platform "$p" \
    --environment production --non-interactive --message "<what changed>"
done
```

`--environment` is mandatory with `--non-interactive`. Without it the command
dies before bundling with `The --environment flag must be set`. It selects the
EAS environment whose `EXPO_PUBLIC_*` variables get inlined into the bundle;
`production` is the one the live binary was built with. The untracked files in
the tree make EAS print the commit with a `*` suffix; that is cosmetic, the
bundle only contains what Metro imports.

Publish to both platforms, because the iOS and Android production binaries
both run runtime `exposdk:55.0.0` on channel `production`. Drop a platform from
the loop only when Step 1 blocked it. Until 2026-10-09 this step said
`--platform ios`: Android users stayed on 2026-09-15 code through 12 merged PRs
while iOS got every OTA.

Do not use `--platform all`. It also exports the web platform, whose static
render fails in Node with `getValueWithKeyAsync is not a function`
(`expo-secure-store` has no web implementation), so nothing publishes. If a run
dies with Metro `ENOTEMPTY`, re-run that platform; it is a cache race.

The store version does not change. No build number, no review. Confirm each
update prints `Runtime version  exposdk:55.0.0` and that both platforms published. If the
runtime differs, it will not reach the live build.

Skip to Step 5 (no GitHub release for an OTA unless the user asks).

## Step 2B — New binary: bump the version

Pick the bump from the nature of the change, and say why:

- **patch** (1.5.1 → 1.5.2) — bug fixes only.
- **minor** (1.5.1 → 1.6.0) — new features, new native dependency, removed
  dependency, redesigned surface.
- **major** — only when the user asks for it.

Edit `expo.version` in `app.config.js`. That is the only version edit needed —
EAS increments the build number itself.

Optionally sync `package.json` `version` to match, purely so the two files stop
disagreeing. It has no effect on the build.

Commit on a branch, open a PR, merge to `main`. Build from `main`, not from the
branch — the tag must point at a commit that exists on `main`.

## Step 3 — Quality gates

Run the same checks CI runs (`.github/workflows/ci.yml`). A red build here is
cheaper than a rejected binary:

```bash
npm run lint
npm run check-i18n      # translation parity — hard requirement on this project
npm run typecheck
npm run test:ci
```

`check-i18n` is not optional. Every user-facing string must exist in all
locales under `i18n/locales/`; list that directory rather than assuming which
languages exist.

## Step 4 — Build, submit, release

### 4a. Build

```bash
npx eas-cli@latest build --platform ios --profile production --non-interactive \
  --message "<version> — <what shipped>"
```

Note the build id it prints. Step 4b needs it, and `git rev-parse HEAD` now, so
Step 4c tags the right commit.

Takes roughly 15–25 minutes. Secrets come from the EAS `production`
environment, **not** from local `.env` — `.env` is never uploaded. The
production environment currently supplies `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SANITY_*`, `EXPO_PUBLIC_POSTHOG_*`
and `EXPO_PUBLIC_AWS_*`. If you added a new `EXPO_PUBLIC_*` variable in this
release, add it to EAS first (`eas env:create --environment production`) or it
resolves to an empty string in the shipped app with no error.

### 4b. Submit to App Store Connect

```bash
npx eas-cli@latest submit --platform ios --profile production \
  --id <buildId from 4a> --non-interactive
```

Pass `--id`, not `--latest`. `--latest` submits whatever build is newest when
the command runs, which is not necessarily the one you just made.

This uploads to TestFlight only. It does **not** create a store version and
does **not** submit for review.

Nothing needs to be exported. `eas.json` carries `ascAppId` and `appleTeamId`,
and EAS supplies its own App Store Connect key from its servers — see the App
Store Connect API key section below.

**Do not trust the submit spinner.** `eas submit` prints `- Submitting` while
the job is still sitting untouched in Expo's queue. On the 1.6.0 submission it
showed that for 23 minutes while the record had not been touched since creation.
The real status is in the EAS GraphQL API — check `updatedAt` against
`createdAt`, not just the status string:

```bash
node -e "
const st=require(require('os').homedir()+'/.expo/state.json');
fetch('https://api.expo.dev/graphql',{method:'POST',
  headers:{'Content-Type':'application/json','expo-session':st.auth.sessionSecret},
  body:JSON.stringify({query:'query(\$id:ID!){submissions{byId(submissionId:\$id){status error{message} logsUrl createdAt updatedAt}}}',
  variables:{id:'<submissionId>'}})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)));"
```

`IN_QUEUE` with `updatedAt` ≈ `createdAt` means nothing has started — that is
queue wait, not a hang, and there is nothing to fix. Cancelling only puts you
at the back of the same queue.

To see whether Apple has actually received the binary, query App Store Connect
directly (`processingState` goes `PROCESSING` → `VALID`); the build does not
appear at all until Apple starts on it:

```
GET /v1/builds?filter[app]=6754875762&limit=3&sort=-uploadedDate
    &fields[builds]=version,processingState,uploadedDate
```

### 4c. Tag and cut the GitHub release

Do this **after** the upload succeeds, so a failed build never leaves a dangling
release.

**Name the built commit explicitly.** A build takes 15–25 minutes, and anyone
merging to `main` in that window moves `HEAD`. A bare `git tag` would then point
at code that never shipped, and the release would misrepresent the binary:

```bash
BUILT=$(npx eas-cli@latest build:view <buildId> --json | node -pe \
  "JSON.parse(require('fs').readFileSync(0)).gitCommitHash")

git tag -a vX.Y.Z "$BUILT" -m "iOS App Version X.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "iOS App Version X.Y.Z" --notes "<notes>"
```

Reading the commit back off the build record, rather than trusting your shell,
is what makes this correct.

Notes should list user-visible changes from `git log <lastTag>..HEAD`, and name
the EAS build number for traceability.

### 4d. App Store Connect

`scripts/asc-release.mjs` drives this over the App Store Connect API. It needs
the three `ASC_*` variables from the key section below.

**Everything is a dry run until you add `--apply`**, and the submission itself
additionally needs `--confirm-submit`. Always read the dry run first.

```bash
cd .claude/skills/app-store-release/scripts
export ASC_KEY_ID=<KEYID> ASC_ISSUER_ID=<ISSUER-UUID> \
       ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8

# Wait until the build shows VALID. Apple takes 5-30 minutes; it does not
# appear here at all until processing starts.
node asc-release.mjs status

# Write the notes to a file first — they are long and locale-identical.
node asc-release.mjs release --version 1.7.0 --build 1.3.9 --notes-file notes.txt
node asc-release.mjs release --version 1.7.0 --build 1.3.9 --notes-file notes.txt \
  --apply --confirm-submit
```

`release` runs four steps in order: create the version, attach the build, write
"What's New" to **every** localization the version has, and submit for review.
Each is also available on its own (`create-version`, `attach-build`,
`whats-new`, `submit`) when only one thing needs redoing.

It refuses to attach a build that is not `VALID`, refuses empty notes or notes
over Apple's 4000-character cap, and is a no-op when the version already exists.

**Still yours in the browser:**

- **Screenshots**, if UI visible in them changed.
- **Release behaviour** — manual, automatic, or phased. Prefer phased for
  anything touching auth, payments, or the Companion.
- **Promotional text / description / keywords**, which live in the vault note
  `20 Areas/Unify/App/Apple App Store Information`. Promotional text can change
  without a submission; description and keywords cannot.

## App Store Connect API key (one-time setup)

Without a key, `eas submit` asks for an Apple ID and a password every run, and
nothing past TestFlight can be scripted. With a key, submission is
non-interactive and the App Store Connect REST API becomes available.

**1. Create the key.** App Store Connect → **Users and Access** →
**Integrations** → **App Store Connect API** → **Team Keys** → **+**.

- Name it something like `unify-eas-release`.
- Role: **App Manager**. `Developer` cannot create a store version or submit
  for review, and `Admin` grants more than this needs.

**2. Save the three values.**

- The `.p8` file. Apple lets you download it **once**. There is no second
  chance — if you lose it, revoke the key and make a new one.
- **Key ID** — 10 characters, next to the key in the list.
- **Issuer ID** — a UUID above the key list, shared by every key on the team.

**3. Store the key outside the repo.**

```bash
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_<KEYID>.p8 ~/.appstoreconnect/private_keys/
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8
```

Never commit a `.p8`, and never paste the key, the Key ID, or the Issuer ID
into a note that syncs (the vault is read by agents). A password manager is the
right home for the backup copy.

**4. Verify it and read the app's identifiers.**

```bash
ASC_KEY_ID=<KEYID> \
ASC_ISSUER_ID=<ISSUER-UUID> \
ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8 \
node .claude/skills/app-store-release/scripts/asc-setup.mjs
```

The script is read-only. It mints a short-lived ES256 token, confirms Apple
accepts the key, then prints the app's `ascAppId`, the current App Store
versions and their states, and every listing localization that needs a
"What's New" entry. It ends with the exact JSON block for `eas.json`.

**5. `eas.json` is already filled in** with the values the script resolved:

```json
"submit": {
  "production": {
    "ios": { "ascAppId": "6754875762", "appleTeamId": "BA3JQQ8HVQ" }
  }
}
```

**6. `eas submit` does not need your key.** EAS holds its own App Store Connect
API key server-side from earlier submissions (`Key Source: EAS servers`) and
uses it regardless of what you export. Confirmed on the 1.6.0 submission, which
used key `969S25J88B`, not the one set up above.

Your key is what makes the **App Store Connect REST API** usable — reading the
`ascAppId`, the Apple Team ID, listing localizations, and build processing
state, none of which the CLI exposes — and it is the prerequisite for
automating Step 4d. To use it, export:

```bash
export EXPO_ASC_API_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8
export EXPO_ASC_KEY_ID=<KEYID>
export EXPO_ASC_ISSUER_ID=<ISSUER-UUID>
```

**This repo is public.** The Key ID and Issuer ID are identifiers, not secrets
— they are useless without the `.p8` — but do not commit them anyway. Keep all
three in a password manager and export them from your shell profile.

EAS already holds a submission key of its own, so Step 4b runs unattended
without any of this. If you ever need a different key on the EAS side, upload
it once with `npx eas-cli@latest credentials --platform ios` → production →
App Store Connect API Key.

**What the key is for.** `eas submit` uploads to TestFlight and stops there.
Creating the store version, writing "What's New", and submitting for review all
run on the App Store Connect API, and this key is what authenticates them —
that is `scripts/asc-release.mjs`, Step 4d.

## Step 5 — Post-release

- Confirm the release is live and matches the tag.
- If a JS-only hotfix is needed on the new binary, it goes out via Step 2A —
  the runtime version still matches.
- Capture anything durable (a new footgun, a changed credential, the shipped
  version) into the vault with `vault-capture`.

## Reading a failed EAS build log

The web UI is fine for a glance, but the log is worth pulling down when you
need to grep it. It is **Brotli-compressed NDJSON**, and the signed URL expires
after 15 minutes, so fetch and decompress in one go:

```bash
npx eas-cli@latest build:view <buildId> --json > bv.json
node -e "require('fs').writeFileSync('url.txt', require('./bv.json').logFiles[0])"
curl -s "$(cat url.txt)" -o log.br          # no --compressed: it breaks the transfer
node -e "
const z=require('zlib'),fs=require('fs');
fs.writeFileSync('log.txt', z.brotliDecompressSync(fs.readFileSync('log.br')));"
```

Each line is JSON with `phase` and `msg`. Group by `phase` to find which one
failed. Logs are pruned after a few months — a build from last release may
return `NoSuchKey`, so do not plan on diffing against an old one.

## A build can break with no change from us

`unify-front-end/ios/` is gitignored, so **no `Podfile.lock` is committed and
every EAS build re-resolves CocoaPods from scratch**. A new release of a
transitive pod can break a build whose JavaScript did not change. When a build
fails and the diff looks innocent, check the pod versions in the log before
hunting through your own commits.

Seen on 2026-09-01: `GoogleSignIn 9.2.0` began pulling `AppCheckCore 11.3.1`, a
Swift pod whose dependencies `GoogleUtilities` and `RecaptchaInterop` are
non-modular Objective-C, so CocoaPods refused to integrate it as a static
library. The `@react-native-google-signin` plugin enables modular headers for
`GoogleSignIn` alone. Fixed by naming the two dependencies in
`expo-build-properties` → `ios.extraPods` with `modular_headers: true`.
Prefer that targeted form over `ios.useFrameworks: "static"`, which changes
linkage for every pod in the app.

## Footguns, ranked

| Symptom | Cause | Fix |
|---|---|---|
| Every `eas` command dies with `config --json exited with non-zero code: 1` | A plugin in `app.config.js` is not in `node_modules` (stale install) | `npm install`, re-run `npx expo config --json` |
| OTA published, nobody receives it | `runtimeVersion` changed since the live build | Ship a binary instead |
| App builds but cannot reach Supabase / Sanity | New `EXPO_PUBLIC_*` var only in local `.env` | Add it to the EAS `production` environment |
| Store version looks wrong | Read `package.json` instead of `app.config.js` | `app.config.js` is canonical |
| Build number conflict | Someone hand-edited `buildNumber` | Leave it to EAS; `appVersionSource` is `remote` |
| OTA crashes the live app | JS calls a native module the shipped binary lacks | This is Step 1's job. Never skip the audit, for either binary |
| Android users stay on old code while iOS gets every update | OTA published with `--platform ios` only | Publish `--platform ios` and `--platform android`, unless Step 1 blocks one |
| `eas update --platform all` fails with `getValueWithKeyAsync is not a function` | `all` includes web, whose static render calls `expo-secure-store` in Node | Publish `ios` and `android` separately |
| `Install pods` fails: "Swift pods cannot yet be integrated as static libraries" | A transitive pod re-resolved to a version pulling a Swift pod with non-modular ObjC dependencies. No committed `Podfile.lock`, so this needs no change from us | Name the pods the error lists in `expo-build-properties` → `ios.extraPods` with `modular_headers: true` |
| Build failed and the diff looks innocent | Pods re-resolve on every build | Check pod versions in the log before blaming your commits |

## Never

- Never run `build`, `submit`, or `update` without an explicit go-ahead in this
  session. Approval for one release does not carry to the next.
- Never OTA a change that touches native code, plugins, permissions, or the
  Expo SDK.
- Never tag before the build succeeds.
- Never release from a dirty tree or a non-`main` commit.
