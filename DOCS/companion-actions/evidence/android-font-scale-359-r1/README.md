# Android live text-size correction

Status: local native checks pass. Independent review is pending. This record does not accept ticket #367, ticket #370, or native criterion 8.

## Scope and identity

- Worktree: `/Users/savargupta/.t3/worktrees/Unify/t3-eb4d49c4`.
- Branch: `fix/companion-android-font-scale-359`.
- Combined parent: `142b8c2a69b40f864e73b096e4751070f2f5d081`.
- Code commit: `7e1421c5ff7c6c21d1a398b2ab42f53d064c33c5`.
- Code tree: `205f831f093edea5ad18bd97acde1a67b86a3012`.
- Web stays at `e8b99343b307a0f7bfa2f99ef74657e97b4f0154`. No web file changed.
- Integration branches did not change during this correction.

The product change has two native Android files. The manifest handles `fontScale` without a new activity. `MainActivity.onConfigurationChanged` first calls the parent method. It then calls the DeviceInfo module's scale refresh through its public lifecycle interface. It does not send a host lifecycle event to the other modules. In the installed React Native 0.83.6 source, DeviceInfo updates its cached scale and sends the dimensions event in that method.

The Android project is tracked. No Expo prebuild, configuration plugin, dependency, locale, JavaScript, account store, or draft cache changed. The XML comparison finds no other manifest change.

## Falsifiers and results

The native command is `font_scale_loop.py <unique-run-name>`. It needs the assigned local fixture, emulator, ADB forwards, Metro and local network controls. It is not a portable CI test. The script types `A1DraftKeep142` through the Android keyboard. It reads the native composer after each live scale change. The expanded script also reads the public React Native Dimensions and PixelRatio values through the loaded app.

The draft-loss claim is false if the native composer loses that exact value. The scale-refresh claim is false if the app still reports the old scale. The focus claim is false if the native composer loses focus.

1. The unchanged native build with combined-parent JavaScript failed at the draft assertion after scale 1.0 changed to 1.3. The native events show activity destruction and creation at the loss. This was an assertion failure.
2. The first manifest-only build kept the draft at 1.3 and 2.0. That first script did not check JavaScript dimensions. The screen showed clipped larger text. A new check then failed: Android reported 1.3, but Dimensions and PixelRatio still reported 1.0. This was an assertion failure before the MainActivity correction.
3. The final two-file build passed the same draft and dimensions checks at 1.3 and 2.0. The draft stayed focused. The native event comparison found no new activity recreation. The composer heights were 126, 147 and 189 pixels at scales 1.0, 1.3 and 2.0. These are observed bounds, not a proportional scaling requirement.
4. A repeat passed at 1.3, 2.0 and back to 1.0. It also asserted focus. The return-to-normal control and the explicit focus assertion were added after the code correction. They are regression controls, not additional test-first claims.

The largest-text screenshot shows the Arabic RTL header, task and plan entries, typed draft, send control and real software keyboard. The earlier clipping is absent in this view. This is one Android 16 API 36 emulator in portrait. It does not establish every screen, locale, Android version or screen-reader result.

The loaded JavaScript hashes match across all three native builds. Each is `d06eba797aee45579d91dcf24e18e712c9df23d2345cf89ebcbe85357e5e3e53`. The selected source comparison for the original build is retained locally. The original native source, package, lockfile and app configuration match the combined parent before the correction. APKs are not byte-identical. Build outputs have separate recorded hashes.

## Checks and proof limits

- Final `assembleDebug`: natural exit 0. APK SHA-256: `4e86a49336a82371cb7b5e4bff46bf4f65ce541e4a5cb60bdbac57c9ab09cbfe`.
- Focused large-text suite: one suite, 20 passed assertions, natural exit 0. This tests rendered client behavior with mocked native boundaries. It does not prove Android geometry.
- Native loop: two passing transitions, then three passing repeat/control transitions. These runs overlap. Do not add them to the Jest count.
- Product diff check: pass. Two files, 14 insertions and one deletion.

The combined parent's service and client gates are supplied evidence in the composition handoff. They were not run again here. The native fixture still uses removal service `c022bb48e61b5195ce3d22e5e9190b4d8b2920a9`. It does not contain the new saved-detail schema. These composer checks do not qualify ticket #370 native workflows.

TalkBack was off for native hierarchy capture. No VoiceOver or TalkBack behavior is claimed. The iOS VoiceOver requirement remains open. Hosted behavior, production deployment, store binaries and release acceptance remain outside this proof.

## Setup failures and cleanup

All behavior failures above remain recorded. These separate setup failures also remain in the local raw records:

- Docker became unavailable. One build stopped before compilation. A second build stopped while the local services started. The final native build exited 0 after the assigned services were healthy.
- The first emulator process ended with signal 9. The cause is not established. The recovery used the same retained AVD with 2048 MiB instead of 3072 MiB.
- Emulator `restrict=on` options did not pass the nonlocal connection control. Do not treat them as isolation proof. After recovery, the app was stopped and disabled. Guest IPv4 and IPv6 rules were then installed. The app launched only after a local HTTP 200 control and a failed nonlocal connection control. The local ADB forwards were restored before that passing gate.
- Fixture errors from the Learn screen were visible and were dismissed through native controls. They include missing lesson-progress data, the local placeholder content source and the public-onboarding fixture. Their captures remain. There is no clean-console claim.
- The emulator-console kill command failed. Verified owned-process termination then stopped the emulator cleanly. This is a cleanup command failure, not a failed product test.

Cleanup verified 11 free ports and five stopped assigned containers. The app was force-stopped and disabled before emulator shutdown. Font scale was restored to 1.0. The emulator and Metro ended with exit 0. The two local servers and forwarder ended with signal 15. The private configuration, AVD data, database volumes and ignored build caches remain for the next native run. Docker Desktop remains running. No integration, PR, hosted service or ticket changed.

Only the listed evidence files are tracked. Full loaded bundles, source maps, private configuration and native binaries remain ignored. Raw command records stay in this worktree. Some verification summaries were generated after the runs. They are summaries of the recorded checks, not new executions.

## Release requirement

This correction needs a new Android binary. An OTA update cannot change the manifest or MainActivity. Ticket #373 must account for that binary requirement before rollout. No version or runtime policy was changed here.

HANDOFF: COMPANION_ANDROID_FONT_SCALE_359_READY_FOR_REVIEW
