// #370 corrections native check: one synthetic account on this worker's local stack, with an
// onboarding profile and one detail saved by the real service from the user's own clear
// "Remember that ..." message (so the conversation also shows its command card).
// Usage (via run_checks.py, which loads ACTIONS_* in memory):
//   python3 build/s370c-stack/run_checks.py node build/s370c-stack/native_seed.mjs <out.json>
// Writes only the synthetic email/password and ids to <out.json>; never a key or token.
import { writeFile } from "node:fs/promises";

const API = process.env.ACTIONS_API_URL ?? "";
const ANON = process.env.ACTIONS_ANON_KEY ?? "";
const SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY ?? "";
if (API !== "http://127.0.0.1:61531" || !ANON || !SERVICE) {
  console.error("this worker's local stack only");
  process.exit(2);
}
const FRIDAYS = "I can attend appointments on Fridays";

async function http(path, { key = ANON, jwt, body, method = "POST", prefer } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${jwt ?? key}`,
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const email = `native-${Date.now()}@details370.invalid`;
const password = "details-native-1";
const made = await http("/auth/v1/admin/users", { key: SERVICE, body: { email, password, email_confirm: true } });
if (made.status !== 200) throw new Error(`createUser ${made.status}`);
const token = await http("/auth/v1/token?grant_type=password", { body: { email, password } });
if (token.status !== 200) throw new Error(`signIn ${token.status}`);
const who = { id: made.json.id, jwt: token.json.access_token };

const profile = await http("/rest/v1/user_onboarding_profiles", {
  jwt: who.jwt,
  prefer: "return=minimal",
  body: { id: who.id, persona: "newcomer", city: "Vancouver", province: "BC", stage: 1, wants_reminders: false },
});
console.log("profile", profile.status);

const [conv] = (await http("/rest/v1/conversations?select=id", {
  jwt: who.jwt, prefer: "return=representation", body: { user_id: who.id, title: "Saved details check" },
})).json;
const [msg] = (await http("/rest/v1/messages?select=id", {
  jwt: who.jwt, prefer: "return=representation",
  body: { conversation_id: conv.id, role: "user", content: `Remember that ${FRIDAYS}` },
})).json;
const action = (body) =>
  http("/functions/v1/companion-actions", {
    jwt: who.jwt,
    body: { contract_version: 1, client: { platform: "ios", app_version: "native-check" }, ...body },
  });
const i = await action({ action: "interpret", message_id: msg.id });
const w = await action({
  action: "apply",
  operation_id: crypto.randomUUID(),
  authorization: { kind: "direct_command", message_id: msg.id },
  operations: [i.json.command.operation],
});
if (w.status !== 200) throw new Error(`remember ${w.status}`);
const out = { email, password, userId: who.id, conversationId: conv.id, messageId: msg.id, detail: FRIDAYS };
await writeFile(process.argv[2], JSON.stringify(out, null, 2));
console.log("seeded", JSON.stringify({ ...out, password: "(in file)" }));
