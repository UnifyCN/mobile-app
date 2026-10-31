from pathlib import Path
import datetime,hashlib,json,re,subprocess
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
source={'path':str(ROOT),'logical_path':'/Users/savargupta/.t3/worktrees/Unify/t3-1f65b158','branch':git('branch','--show-current'),'head':git('rev-parse','HEAD'),'tree':git('rev-parse','HEAD^{tree}'),'parent':git('rev-parse','HEAD^')}
assert source['head']=='964990d7d5e0891a089c97909c2d7b1c99f768b4' and source['parent']=='3b03a675a1287e1f212e77fe956863f5db8e2132'
focus=json.loads((HERE/'focused-terminal-results.json').read_text())
assert focus['numPassedTests']==65 and focus['numPendingTests']==1 and focus['success']
full=(HERE/'test-ci-final.log').read_text();count_rows=re.findall(r'Tests:\s+(?:(\d+) skipped, )?(\d+) passed, (\d+) total',full)
assert count_rows==[('25','1597','1622'),('','13','13')],count_rows
faults=json.loads((HERE/'fault-results.json').read_text());assert len(faults)==4 and all(f['binding_assertion_failure'] for f in faults)
cleanup=json.loads((HERE/'cleanup-verification.json').read_text());assert cleanup['passed'] and not (HERE/'private').exists()
gates={name:json.loads((HERE/(name+'-command.json')).read_text()) for name in ['test-ci-final','types-final-r2','i18n-final','lint-final','export-native-final','focused-terminal','local-client-final']}
assert all(g['exit']==0 for g in gates.values())
inputs=json.loads((HERE/'mobile-inputs.json').read_text());assert all(hashlib.sha256((ROOT/r['path']).read_bytes()).hexdigest()==r['sha256'] for r in inputs)
# No raw local keys enter the public startup artifact.
p=HERE/'local-start-redacted.log';raw=p.read_text();raw=re.sub(r'("DB_URL"\s*:\s*")[^"]*(")',r'\1<redacted local connection credential>\2',raw);p.write_text(raw)
p=HERE/'startup-redaction.json';d=json.loads(p.read_text());d['local_credential_fields_removed'].append('DB_URL');p.write_text(json.dumps(d,indent=2)+'\n')
summary={'status':'implementation_complete_for_independent_review','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_candidate':source,'evidence_commit_parent':source['head'],
 'final_identity_note':'The final reply pins the evidence-only child commit. This saved report pins its exact code parent to avoid a self-referencing commit hash.',
 'approved_mobile_parent':source['parent'],'approved_mobile_parent_tree':'ff68e12229b653a47f3863036b6862571ac77877','approved_web_head':'8f3720af36c50768ff05d25804a69d28d36fd5c4','approved_web_tree':'c05d364f28618edf949e7bbdf404fb99d1b2394e',
 'integrations':{'mobile':'19c2d0d6ea9d7b90d1bb0b10ae345cf6f2cbe83c','web':'623179cee615057de2c20c8c6216e192891dab4b'},
 'gates':gates,'full_mobile':{'main_passed':1597,'main_skipped':25,'dst_passed':13,'natural_exit':True,'force_exit':False},'focused_new_tests':{'passed':65,'skipped_local_opt_in':1,'test_files':11},'real_local_service':{'final_cases_passed':1,'real_jwts':True,'approved_edge':True,'persisted_readbacks':True,'sdk_or_secure_store_native':False,'provider_sends':0},
 'sensitivity':{'faults':4,'binding_failures':4,'survivors':0,'exact_restore':True},'lint':{'exit':0,'errors':0,'warnings':68},'locales':['ar','en','es','fr-CA','hi','pa','vi'],'new_translation_leaves_per_locale':35,
 'cleanup':cleanup,'retained_ignored':{'node_modules_kib':2276040,'dist_kib':40252,'expo_directory_present':False},'unchanged_contract_dependencies_config':json.loads((HERE/'terminal-authority.json').read_text())['unchanged_inputs'],
 'impeccable':'3.9.1','ticket_369_accepted':False,'native_criterion_8_accepted':False,'hosted_or_real_provider_qualification':False,
 'limits':['SDK stand-ins do not prove native permission, Keychain/Keystore persistence, native layout, focus or screen-reader behavior.','No actual Expo/APNs/FCM send or device delivery/navigation was attempted.','A retired installation or pending operation from a previous sign-in fails closed. No automatic transfer, reclaim or replay under the next sign-in is implemented. An old pending cleanup intent remains secure and does not claim server revocation.','No hosted write, deployment, integration update, PR, push or ticket acceptance.','The complete suite retains existing React act/SDK warnings. Lint passes with 68 warnings.','Three setup/tool diagnostics retain excerpts and tool-chunk provenance; behavior/compiler and command gates retain their raw files. The successful startup log is redacted and its raw local credentials are removed.','The real local client case uses custom-task delivery fixture rows. The approved broader server suite, published-content cases and worker/provider cases were not rerun.']}
(HERE/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
text=f'''# Mobile push client implementation handoff

Status: implementation complete for independent review. No ticket or native acceptance.

## Exact source candidate

- Primary: `{source['path']}`. The prepared logical path is `{source['logical_path']}`.
- Branch: `{source['branch']}`.
- Code HEAD: `{source['head']}`.
- Code tree: `{source['tree']}`.
- Code parent: `{source['parent']}`, tree `ff68e12229b653a47f3863036b6862571ac77877`.
- The final reply pins the evidence-only child commit. Its parent must equal the code HEAD above. This avoids a self-referencing hash inside the commit.
- Fixed WEB: `8f3720af36c50768ff05d25804a69d28d36fd5c4`, tree `c05d364f28618edf949e7bbdf404fb99d1b2394e`.
- Integrations remain MOBILE `19c2d0d6ea9d7b90d1bb0b10ae345cf6f2cbe83c` and WEB `623179cee615057de2c20c8c6216e192891dab4b`.

The server-stage marker, both source pins and trees, both review hashes and all five authority hashes match. `terminal-authority.json` records them. The fixed contract types, package declarations, lockfile, app config, SQL, instructions and protected prior evidence remain unchanged. `mobile-inputs.json` pins the implementation and test bytes. Impeccable remains 3.9.1 with the approved hash.

## Change and behavior

The existing ReminderSection now contains one device-level Companion control. It states that the control applies across tasks. The in-app editor and list remain independent. The control separates system permission, current enrollment and historical save status. It uses the existing bottom sheet, native text roles and minimum touch targets. There is no new page or navigation direction.

A narrow adapter reuses the existing Expo token facility. Companion uses the shared authenticated action transport and separate strict push parsers. It never uses the legacy direct token-table write path. Social and Learn keep their senders and routes. Raw token and error-body logging was removed from the touched legacy facility. No new analytics event or model request was added.

A single SecureStore value holds the UUID, independent random 32-byte secret, exact pending request, operation ID and local owner/session binding. The proof uses 64 lowercase hexadecimal characters. The iOS option is WHEN_UNLOCKED_THIS_DEVICE_ONLY without biometric authentication. The existing SecureStore plugin configures Android backup exclusion. `android-backup-config.json` pins the installed plugin and both exclusion XML files. The AsyncStorage marker contains only a creation flag. It detects lost proof and provides no authority.

Permission is requested only through explicit device enable. Permission denial, unsupported devices, service rollback and storage/network failures do not change task progress or reminder persistence. Missing, partial, corrupt or locked proof fails closed. There is no ID/account/token-only recovery or shared token-row deletion.

The common account service now distinguishes actual Auth session changes for the same account. A same-session refresh and confirmed same-session subscription restart preserve existing behavior. Unknown ownership blocks work. All later permission, token, storage, request, retry and UI boundaries check the captured common account epoch. Session IDs only restrict local replay. The server still derives authority from its validated JWT.

Lost writes retain the exact secure request. Status lookup precedes retry. Pending and failed lookups stay unknown. Retry rechecks status, current revision, permission, token, locale and the original Auth session. A revised token or revision requires a new operation ID. Historical receipts are parsed without Undo and reconciled with push_read.

The native token listener fetches a fresh Expo token. It never enrolls the APNs/FCM token from the event. Foreground checks reconcile permission and current enrollment. Disable and revoke are separate revision-checked operations. Sign-out clears local ownership immediately and saves the old owner's pending cleanup intent securely. The client never reports server revocation before confirmation.

Warm and cold responses retain only a valid Companion delivery UUID. They pass through normal authentication and push_resolve before task selection. Account/session/delivery identity coordinates listener, last-response and repeated-mount paths. A committed owned sheet result acknowledges the intent. The client then checks and clears the matching SDK last response synchronously. A newer response is preserved. Late old-account results cannot select a task or restore a title or draft.

The current task opens in the existing Companion sheet over the retained conversation. The mounted caller test preserves composer text and a reminder edit draft. The sheet checks its current owned task data before it displays a notification target. Removed, inaccessible and failed reads use a generic unavailable result. Stable custom: and sanity: references remain separate.

## Evidence and falsifiers

| Subsystem | What the fresh test proves | What it passes through or does not prove |
| --- | --- | --- |
| Reminder UI | Actual mounted editor/client/store saves and cancels under six push states. Requests contain only reminder operations. | SDK/service push states in this matrix are stand-ins. |
| Secure device state | Actual adapter call order, independent random inputs, exact pending persistence, proof loss, held reads/writes and content-free logs. | Native encryption, device backup/restore and real locked-device behavior. |
| Ownership and recovery | Held permission/token/storage/enrollment/status/read/resolve paths, batched reset, new same-account session, token-refresh controls, restart and exact retry identity. | Supabase SDK event order and native process termination. |
| Root and Companion | Actual root hook and screen callers, warm/cold deduplication, signed-out launch, late resolver/SDK replies, Expo rotation and foreground permission, retained drafts, unavailable targets, unchanged social/Learn routes. | Native routing, observed keyboard/focus, VoiceOver or TalkBack. |
| Local service | Real JWTs, exact approved Edge code, actual client/transport, saved enable/read/rotate/disable revisions, lost-reply status, exact unapplied retry, foreign isolation, completed and removed target resolution. | Native SDK behavior, provider sends, hosted state or production policy. |
| Localization and layout | All seven real translation sets, RTL direction, accessible names/state/result properties and declared 44 pt/48 dp targets. | Measured native clipping, expanded native text layout and screen-reader speech. |
| Native exports | Current iOS and Android bundles compile. | Native workflow or delivery acceptance. |

The initial parent fails the mounted control test and the types-only push parsing test. The first restart assertion was too broad: retained tests require a confirmed same-session restart to preserve drafts. The final restart case binds to a different actual Auth session ID. No legacy assertion changed.

The mounted warm/cold test exposed duplicate navigation. A later held-resolver test exposed a new-account intent waiting behind an old resolver. The token retry test exposed use of an obsolete token. Each has retained assertion RED and subsequent passing evidence. Controller and SDK tests without a retained assertion RED are not described as RED-first evidence.

Four focused faults remove captured-owner checks, omit the first secure persistence, require biometric storage, and remove deduplication. All fail binding assertions. Every source restores to its saved hash. `fault-results.json` records zero survivors. The final complete suite and 65-case focused run pass after restoration.

## Gates

- `npm run test:ci`: natural exit 0. Main: 1,597 passed, 25 skipped. DST: 13 passed. No forceExit.
- Focused new client set: 65 passed, one local opt-in case skipped, across 11 files. `focused-terminal-results.json` records the exact set.
- The local opt-in case passes separately with real JWTs and persisted readbacks. The fixture setup failure and corrected final run remain separate.
- Typecheck and seven-locale parity pass. Each locale adds 35 leaf strings.
- Changed-file ESLint exits 0 with 68 disclosed warnings. It is not a warning-free or global lint result.
- Both iOS and Android exports pass. Ignored `dist` is retained.

`ledger.md`, unique command JSON files and raw logs retain the failing and passing behavioral/compiler gates. The first local bootstrap failed on workspace-only frozen-lock metadata. Its adapter removes that metadata while retaining every dependency resolution section. The first local client case used incorrect fixture columns and table names. Only its fixture setup changed. The first cancellation test selected its control too soon and then supplied the wrong receipt fixture field. These are setup corrections, not server or product regressions. The successful startup output is redacted; its raw local credentials were removed during private cleanup. The setup/tool excerpts identify their original tool chunks and do not claim to be reconstructed full raw logs.

## Cleanup and limits

Only project `unify-push-369-client-r1` used ports 63610-63616. Its five running identities and workdir labels were verified before use and stop. No database was shared or reset concurrently. The owned stack, readonly exact WEB export, temporary credentials and caches are removed. All 1,504 exported blobs matched their Git objects and terminal hashes before removal. No provider/content sender process or actual delivery was started.

The frozen cleanup comparison preserves all 33 protected container IDs, names, states and complete mount objects. Four mount arrays changed order only. All 18 volume names and seven nondefault network IDs match. All 14 IPv4/IPv6 port binds pass. Strict network identity remains false. The default bridge was replaced during the fresh Resource Saver startup at 20:59:21.758423 UTC through engine readiness at 20:59:23.435979 UTC. Its creation at 20:59:23.316159 UTC falls inside that interval. The raw resync lines name both IDs. `cleanup-verification.json` records the bounded disposition. It makes no continuous observation or direct internal-cause claim.

Ignored dependencies remain in this primary: node_modules uses 2,276,040 KiB and dist uses 40,252 KiB. There is no .expo directory. Retained native and unrelated data were not used or removed.

A retired installation or an old sign-in's pending authorization deliberately enters an unavailable session state. This client does not transfer or reclaim it automatically. The old secure cleanup intent remains saved. It cannot use the next account's auth, and it does not prove server revocation. Credential-loss recovery remains a separate flow under the approved contract.

Actual native permission/storage, text scaling/clipping, keyboard/focus, observed VoiceOver/TalkBack, device delivery, hosted behavior and release qualification remain open. Ticket #369 and native criterion 8 are not accepted. No push, PR, ticket update, deploy, hosted write, integration edit, child agent, provider switch or real provider send occurred. Independent review must be a new task.

Official SDK checks: [Expo notifications](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/), [SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/), [Supabase session read](https://supabase.com/docs/reference/javascript/auth-getsession). Installed versions and source hashes are saved separately. They were not upgraded.

COMPANION_PUSH_369_MOBILE_CLIENT_IMPLEMENTATION_R1_DONE
'''
assert '\u2014' not in text
(HERE/'HANDOFF.md').write_text(text)
print('Saved HANDOFF.md and summary.json for exact code candidate',source['head'])
