# Native push eligibility correction

The code correction is complete. The required code gates pass. Native push acceptance remains INCOMPLETE on both platforms. Two iOS setup launches reached the stop bound. No native sign-in, enrollment, notification injection or provider send ran.

The primary is `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify/t3-53844316`. Its logical path is `/Users/savargupta/.t3/worktrees/Unify/t3-53844316`. Its branch is `t3/companion-push-native-eligibility`.

| Input | Commit | Tree |
| --- | --- | --- |
| Required clean base | `d545c7fd78b43c66e950dfa491cbad446318634b` | `157c6d67bd168c2e49919c92049571b43b61a042` |
| Tested product candidate | `9c6788890fedb8c2f9f4f6196679313427b6333c` | `14c8893ce262a2e97553be16a2f4496f89b1ec8d` |
| Read-only WEB service | `8f3720af36c50768ff05d25804a69d28d36fd5c4` | `c05d364f28618edf949e7bbdf404fb99d1b2394e` |
| Preserved original MOBILE source | `f9c1b606d7f7afbe04184c7fb04a788da6c28511` | `f11c9175cec92b01c0f55e5048ed9d8aa52ac28c` |

The later evidence commit contains this handoff. Its application files equal the tested product candidate. The terminal receipt at `build/369-native-eligibility-r1/terminal-authority.json` records the final evidence commit and tree after commit creation. The final response also reports that commit. This avoids a self-reference in a committed file.

## Product change and test-first proof

Only `unify-front-end/services/companionActions/pushNative.ts` and its existing focused test changed. The adapter now rejects platforms other than iOS and Android. It lets the native SDK report permission and token availability. The unused Device import is removed. The legacy automatic registration function is unchanged.

The official [SDK 55 notifications documentation](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/) and [push setup documentation](https://docs.expo.dev/push-notifications/push-notifications-setup/) were checked on 2026-10-30. They permit compatible virtual native environments. They still require the applicable native build and provider configuration. This correction removes the unconditional physical-device restriction. It does not grant registration capability to an unconfigured installation.

The two parameterized virtual-platform cases call the public `CompanionPushDevice.enable` adapter with `Device.isDevice=false`. Both failed on unchanged code because the native permission API had zero calls instead of one. See `red-virtual-native.log` and its command record. The red run selected only these two cases. Two later assertion spellings, the lowercase authorization header and `serviceDisabled` state, were corrected before the green run. Neither changes the binding permission assertion or an old assertion.

The green test checks the permission request, real adapter token facility, Android channel order, captured account/session, secure write and authenticated action envelope. Nonnative, denied-permission and account-loss controls remain. All seven previous adapter cases remain. No test sets a real native device identity to true.

| Final command | Result | Scope |
| --- | --- | --- |
| Adapter file | 14 passed | SDK stand-ins and captured-owner client boundary |
| Focused push pattern | 82 passed, 5 skipped; 12 passed suites, 2 skipped suites | Client, rendered-client, lifecycle, parsing, storage and routing controls |
| `npm run typecheck` | Exit 0 | Normal project types |
| Changed-file ESLint | Exit 0, no diagnostics | The two changed files |
| `npm run check-i18n` | Exit 0 | Existing locale parity checker |
| Natural `npm run test:ci` | Exit 0; main 1,614 passed and 29 skipped; DST 13 passed | Existing local suite; no timeout or force-exit flag |
| Both native exports | Exit 0 | One iOS bundle and one Android bundle; no native workflow claim |
| iOS local prebuild, pods and Xcode build | Exit 0 | Current local Debug development shell, both simulator architectures |

The first focused command named two absent test files. It failed with ENOENT. `final-focused-command.json` and its log retain that tool error. The corrected pattern run is `final-focused-r2`. Existing Expo Go and React act diagnostics remain in the passing suite logs. No clean-console claim is made.

Some raw logs contain test-runner whitespace. The first staged whitespace check failed on those bytes. Those logs are compressed without changing their decompressed bytes. `compressed-logs.json` records their sizes and hashes. The first whitespace result is also retained in compressed form. The main CI, corrected focused and type logs use `.gz` suffixes.

## Exact local runtime

The owned project was `unify-push-369-native-r1`. All 20 IPv4/IPv6 port binds passed before startup and after cleanup. The assigned ports were 63710-63716, 8371, 3396 and 3397.

The WEB runtime is an export of 1,504 exact Git blobs. No WEB checkout was created. All exported bytes still matched before cleanup. The existing baseline migrations and approved `readyPush` bootstrap ran in their existing order. The separate approved local profile/history/context fixtures also ran. These are disposable fixtures, not hosted migrations. `native-fixture-schema.json` records their source hashes.

All 35 effective mounted service inputs matched the approved export. The container content URL was `http://host.docker.internal:3396/content`. The first host mount comparison failed because Docker Desktop adds `/host_mnt`. The corrected byte check used the actual container destination. Both records remain.

The native build used Expo 55.0.17, notifications 55.0.20, device 55.0.15, SecureStore 55.0.13, dev-client 55.0.28 and React Native 0.83.6. The package, lockfile, app config and iOS Google plist matched the current primary. `native-build-inputs.json` records their hashes. No product config or entitlement file changed.

The native guest was a new iPhone 17 simulator on iOS 26.5. The owned test installation used the current local build. Its only binary instrumentation added a local sandbox dependency to the Debug library. The unmodified build remained in the ignored build directory. `installed-native.json` records the first installation. `ios-setup-2-signature.json` records the final signed installation hashes. This test shell is not a release build.

Metro served a manifest and a 29,025,551-byte bundle with HTTP 200. The source map matched 563 application files, including the corrected adapter. These are served-source checks. The application never opened that bundle. They do not prove loaded native product code.

## Network gate and bounded failures

The native SDK helper proved local IPv4 and IPv6 HTTP 200 responses. It also proved kernel EPERM for all 26 resolved addresses of the hosted Supabase, analytics and model endpoints. Named external requests returned no response. The first helper expected EPERM at the URL layer and instead received DNS error -1003. That failed attempt remains. The corrected helper checks every resolved address at the socket boundary as well as the URL result. It retains the same denial requirement.

The sandbox permits only local ports 63710, 8371, 3396 and 3397. Expo registration is also denied because provider credentials are unverified. The helper policy bytes are separate from the app load-order gate. A passing helper does not close that gate.

1. Android prebuild failed because `google-services.json` is absent. `GOOGLE_SERVICES_JSON` does not identify an available file. adb, emulator and sdkmanager are absent from PATH and the checked conventional and historical SDK paths. No new SDK, AVD or substitute credential was created. This prerequisite blocks further Android setup.
2. iOS launch 1 failed with Code Signature Invalid before a usable app launch. The first screenshot shows the owned guest home screen. The diagnostic record remains.
3. iOS setup repair explicitly signed the two owned top-level dylibs before signing the app. Launch 2 reached the development launcher. Its guard READY is at line 561. The first bundled framework initializer is at line 404. The first `Unify.debug` initializer is at line 562. The required strict order fails. The original failed load-order assertion remains. No third setup launch ran. The app stopped before any product bundle selection or sign-in.

The developer launcher screenshot is setup evidence only. No supported native API was replaced with a token fixture. No physical phone was used. Provider credentials and effective send policy were not verified. No dispatcher or provider send was enabled.

## Native criterion matrix

| Required cell | iOS | Android |
| --- | --- | --- |
| Native permission allow and deny | INCOMPLETE: guard order | INCOMPLETE: setup prerequisites |
| Independent native in-app reminder save | INCOMPLETE | INCOMPLETE |
| Native SecureStore process restart and proof isolation | INCOMPLETE | INCOMPLETE |
| Native enrollment and authenticated persisted readback | INCOMPLETE | INCOMPLETE |
| Warm notification tap to current stable task | INCOMPLETE | INCOMPLETE |
| Cold notification tap | INCOMPLETE | INCOMPLETE |
| Signed-out tap and normal authentication | INCOMPLETE | INCOMPLETE |
| Removed or inaccessible task | INCOMPLETE | INCOMPLETE |
| Composer/task draft and focus retention | INCOMPLETE | INCOMPLETE |
| Disabled/failed push preserves reminder and progress | INCOMPLETE | INCOMPLETE |
| Actual Expo/APNs/FCM delivery | INCOMPLETE | INCOMPLETE |

`native-matrix.json` records each block. The local fixture created one synthetic account, one new custom task and four suppressed delivery rows. These rows were setup only. They were never injected into the OS. The final DB read found zero Auth sessions, zero push enrollments, zero provider attempts and zero action receipts. The dispatcher was disabled. No native write needs a claimed persisted readback because no native write occurred.

| Proof class | Established | Not established |
| --- | --- | --- |
| SDK/client fixtures | Binding red/green adapter cases and passing focused controls | Native API behavior or provider delivery |
| Real local service | Exact source/container identity, approved bootstrap and final DB counts | Native enrollment or native action persistence |
| Native SDK helper | Local success and external socket denial under the policy | Correct early policy application to the app |
| Native OS notification injection | No injection ran | All notification routing cells |
| Actual provider delivery | Zero sends | Expo, APNs and FCM delivery |
| Hosted proof | No hosted operation ran | Hosted permissions, migration or release acceptance |

## Cleanup and scope limits

The owned app stopped. Both owned host servers stopped. The five owned containers, owned project volumes and owned network are absent. The new simulator and its test installations are deleted. No guest preference changed. The private local account, manifest, bundle and source-map copies were removed after their hashes were saved.

The one terminal before/after comparison preserves all 33 protected container identities, states, labels, restart policies and full mount objects with multiplicity. All 18 protected volumes and 14 retained simulator records match. All 1,007 old evidence files and all 99 Impeccable 3.9.1 files match their saved hashes. All three fixed external source worktrees retain their heads, trees and clean status. No Android guest or original Android data was used. This does not claim a byte-level audit of every retained Android data page.

Strict resource equality failed because the default Docker bridge changed from `7f1c2b98dffc51d67daa777401732f3512cf03dae8723cdcd723f3b493f01140` to `28e6805207ba42516ea6b03c04033c4a4df26e4a8cfe68621b927b6fee7dd871`. The bounded current startup log shows engine start from `Idle:shutdown`, followed by de-registration and re-registration of those exact IDs. No nondefault network changed. No global Docker restart command ran. No repeat resource snapshot was used to obtain a pass. `cleanup-verification.json` retains the strict failure. `bounded-cleanup-disposition.json` records the explained default-bridge exception. `strict_network_ids_unchanged=false` remains.

Two execution limits require separate review. npm and CocoaPods used their default external tool caches. Metro also used its default temporary cache. There is no before-state cache record, so strict confinement of those cache writes is unproven. No external cache cleanup ran. The log wrapper initially retained private startup originals. The redacted copies now replace those owned originals. This delay is recorded in `startup-redaction-disposition.json`. Private configuration remains outside tracked evidence. The new outgoing evidence is scanned before commit.

No child, account/provider switch, push, PR/issue/watch action, integration move, hosted change, instruction edit or ticket acceptance ran. `/tmp/unify-companion-359/state.json` was not changed. Native criterion 8, iOS VoiceOver, ticket acceptance and release acceptance remain separate and INCOMPLETE.

COMPANION_PUSH_369_NATIVE_ELIGIBILITY_RUNTIME_R1_DONE
