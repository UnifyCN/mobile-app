# Companion push contract 1

Both clients use the existing authenticated `POST /functions/v1/companion-actions` boundary. Mobile sends the user's JWT and the public API key. The account and session come from the validated JWT. A client-supplied owner or session is refused. The WEB deployment owns this handler. MOBILE owns migration `20261030181040_companion_reminder_push.sql`. WEB has the exact migration and rollback mirror.

The fixed client types are `lib/companionActions/pushContract.ts` in WEB and `unify-front-end/services/companionActions/pushContract.ts` in MOBILE. Their bytes match. These types add no client behavior. The later client stage must parse push receipts separately from the existing task-only receipt parser. Unknown additive response fields must be ignored.

Before the first request, save a random UUID and an independent random 32-byte secret together in SecureStore. Encode the secret as 64 lowercase hexadecimal characters. Persist the operation ID and exact pending request before registration can lose its reply. The server retains only a SHA-256 secret hash. The examples below contain synthetic values and no usable keys. Never copy the example proof into a device.

Use iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Exclude Android SecureStore data from backup. Do not require a biometric prompt for this service credential. Do not use AsyncStorage, payloads, logs, or analytics for the proof. Missing or unreadable credentials fail closed. A restored backup is not proof of possession of an old installation.

```json
{
  "contract_version": 1,
  "client": {"platform": "ios", "app_version": "1.0.0"},
  "action": "push_apply",
  "operation_id": "11111111-1111-4111-8111-111111111111",
  "authorization": {"kind": "ui_control"},
  "operation": {
    "type": "push.enroll",
    "installation_id": "22222222-2222-4222-8222-222222222222",
    "installation_secret": "0000000000000000000000000000000000000000000000000000000000000000",
    "expected_revision": 0,
    "token": "ExponentPushToken[synthetic369-example]",
    "enabled": true,
    "locale": "en"
  }
}
```

`push.enroll` creates, renews, rotates the token, or transfers a proved installation. Every change requires the current enrollment revision. Zero means no installation row. The server changes the generation on every accepted change. Supported platforms are `ios` and `android`. Locales are `ar`, `en`, `es`, `fr-CA`, `hi`, `pa`, and `vi`. The operation accepts no other fields.

A successful reply uses the common receipt contract. This is its relevant result shape. The receipt also has the existing common summary fields.

```json
{
  "status": "applied",
  "replayed": false,
  "operation_id": "11111111-1111-4111-8111-111111111111",
  "results": [{
    "type": "push.enroll",
    "installation_id": "22222222-2222-4222-8222-222222222222",
    "revision": 1,
    "generation": "33333333-3333-4333-8333-333333333333",
    "enabled": true,
    "revoked": false,
    "locale": "en",
    "before_revision": 0,
    "after_revision": 1
  }],
  "receipt": {
    "operation_id": "11111111-1111-4111-8111-111111111111",
    "operation_type": "push.enroll",
    "undoable": false,
    "current": null
  }
}
```

A receipt describes the saved action at its commit. Use `push_read` for the current enrollment. Do not treat receipt `enabled` as current delivery eligibility. Push receipts have no Undo. Disabling or enabling is a new revision-checked operation. Credential revocation is terminal.

```json
{
  "contract_version": 1,
  "client": {"platform": "android", "app_version": "1.0.0"},
  "action": "push_read",
  "installation_id": "22222222-2222-4222-8222-222222222222",
  "installation_secret": "0000000000000000000000000000000000000000000000000000000000000000"
}
```

The response is `{"enrollment": null}` when no owned, proved enrollment exists. Otherwise `enrollment` has the installation ID, revision, generation, enabled state, revoked state, and locale. It has no token, secret, session ID, or foreign-account status.

For `push.disable` and `push.revoke`, use `push_apply` with a new operation ID. The operation contains only `type`, `installation_id`, `installation_secret`, and `expected_revision`. Disable rotates the generation and stops eligibility. Revoke also ends use of the credential. Neither operation changes task progress or the in-app reminder. A revoked installation ID cannot enroll again. Loss of the secret cannot reclaim the old ID. A new ID cannot silently claim a token still bound to another installation. Native credential loss and token recovery need a separate verified flow.

Transfer needs the same installation proof, the current revision, and removal of the old server session. Possession of the ID, the same account, or a new token is insufficient. A same-token transfer changes only its exact linked shared token row. A different-token transfer preserves the old social/learn token row. A copied bearer secret remains a compromise risk; this is not device attestation.

After a lost write reply, use the unchanged common `status` action with the operation ID. `pending` permits another lookup. A failed lookup keeps the result unknown. `applied` returns the historical push result. `not_applied` permits the same exact request only while its authorization and revision remain current. A changed request needs a new operation ID. The common namespace rejects reuse of an ID for another action. A fresh `push_read` reconciles current enrollment after any historical replay.

Enrollment and dispatch require verified effective server policy. Missing policy fails closed. HTTP 503 `push_disabled` means the push service is disabled or absent after rollback. HTTP 401 rejects invalid or removed Auth sessions. HTTP 403 rejects session/proof/ownership authority. HTTP 409 reports revision conflict, operation ID reuse, or token collision. HTTP 422 rejects malformed fields. Existing gate, version, platform, lock-wait, and status rules remain in force. No response or error returns a private token or proof.

Provider payload data is only `{"type":"companion_reminder","delivery_id":"<uuid>"}`. It has generic translated title/body text. Treat all payload data and SDK response identifiers as untrusted. Retain only this minimal intent through normal sign-in. Do not navigate from a payload task ID or URL.

```json
{
  "contract_version": 1,
  "client": {"platform": "ios", "app_version": "1.0.0"},
  "action": "push_resolve",
  "delivery_id": "44444444-4444-4444-8444-444444444444",
  "language": "en"
}
```

The response is `{"target":"unavailable"}` or `{"target":"available","task_ref":"custom:123"}`. A content-backed reference uses `sanity:<published-id>`. The server checks delivery ownership first. It then checks current task access and removal. A completed accessible task can open in its current state. Another account cannot use the same published task ID to resolve the delivery. Missing content access returns unavailable; an unavailable content service returns HTTP 503. The client must handle all outcomes without exposing the previous account's cached title or task.

Offline sign-out must clear local ownership immediately. It cannot claim confirmed server revocation before the server removes the session. Retain any required revocation request securely for reconnect. A new account cannot transfer the installation while the old server session remains. An OS permission change while the app is closed has no immediate server signal.

The client stage must implement SecureStore persistence/loss handling, captured account and session-epoch checks across permission/token waits, token changes, disable/revoke/sign-out recovery, warm and cold notification responses, account-scoped response deduplication, last-response clearing, normal authentication, and the existing Companion task-sheet navigation. It must preserve drafts and focus. It must add the required native and rendered-client proof. This server stage provides no native delivery or navigation acceptance.

Push permission is never required to save an in-app reminder. Do not reuse `wants_reminders`, which remains the learn setting. Do not add email or change WEB reminder UI. Provider tickets and receipts do not prove device display. A provider-accepted notification can remain in flight after cancellation. Unknown send outcomes never retry automatically.
