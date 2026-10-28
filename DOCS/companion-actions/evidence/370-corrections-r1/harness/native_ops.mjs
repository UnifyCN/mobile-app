// #370 corrections native check: the synthetic account's "other device" and readback, against
// this worker's local stack only. Run via run_checks.py (ACTIONS_* in memory).
//   native_ops.mjs <account.json> read
//   native_ops.mjs <account.json> edit-elsewhere <detail text now> <new text>
//   native_ops.mjs <account.json> remember <text>
// Prints JSON; never a key or token.
import { readFile } from "node:fs/promises";

const API = process.env.ACTIONS_API_URL ?? "";
const ANON = process.env.ACTIONS_ANON_KEY ?? "";
if (API !== "http://127.0.0.1:61531" || !ANON) process.exit(2);
const [file, cmd, ...args] = process.argv.slice(2);
const acct = JSON.parse(await readFile(file, "utf8"));

async function http(path, body, jwt = ANON, prefer) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${jwt}`, ...(prefer ? { prefer } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const jwt = (await http("/auth/v1/token?grant_type=password", { email: acct.email, password: acct.password })).json.access_token;
const action = (body) =>
  http("/functions/v1/companion-actions", { contract_version: 1, client: { platform: "ios", app_version: "native-check-other-device" }, ...body }, jwt);
const details = async () => (await action({ action: "read" })).json.details ?? [];

if (cmd === "read") {
  console.log(JSON.stringify((await details()).map(({ detail_id, text, revision }) => ({ detail_id, text, revision }))));
} else if (cmd === "edit-elsewhere") {
  const [from, to] = args;
  const d = (await details()).find((x) => x.text === from);
  if (!d) throw new Error("no such live detail");
  const w = await action({
    action: "apply",
    operation_id: crypto.randomUUID(),
    authorization: { kind: "ui_control" },
    operations: [{ type: "detail.update", detail_id: d.detail_id, text: to, expected_revision: d.revision }],
  });
  console.log(JSON.stringify({ status: w.status, revision: w.json?.receipt ? d.revision + 1 : null }));
} else if (cmd === "remember") {
  const text = args[0];
  const [conv] = (await http("/rest/v1/conversations?select=id", { user_id: acct.userId, title: "Second detail" }, jwt, "return=representation")).json;
  const [msg] = (await http("/rest/v1/messages?select=id", { conversation_id: conv.id, role: "user", content: `Remember that ${text}` }, jwt, "return=representation")).json;
  const i = await action({ action: "interpret", message_id: msg.id });
  const w = await action({ action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "direct_command", message_id: msg.id }, operations: [i.json.command.operation] });
  console.log(JSON.stringify({ status: w.status }));
} else process.exit(2);
