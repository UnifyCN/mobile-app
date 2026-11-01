// @vitest-environment jsdom
/**
 * Probe #360: the web app's REAL checklist consumer (services/checklist.ts and its
 * @supabase/ssr browser client, at a fixed web commit) against the disposable local stack.
 *
 * web_consumer_test.ts copies this file into a detached web checkout as
 * __probe360__-<run id>/webConsumer.test.ts and runs that checkout's own Vitest under jsdom
 * (document.cookie holds the session, as in a browser). Only @/lib/sanity is replaced:
 * Sanity is the content source, not the consumer under test, and the hosted dataset
 * must not decide the result. Everything that talks to Supabase is the web code as shipped.
 *
 * Env: PROBE_PHASE, PROBE_OUT, PROBE_CARRY, PROBE_API_URL, PROBE_ANON_KEY,
 *      PROBE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY (local stack).
 */
import * as fs from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sanity", () => ({
  isSanityConfigured: () => true,
  mergeI18nOverlay: (row: Record<string, unknown>) => {
    const { i18n: _drop, ...rest } = row;
    return rest;
  },
  sanityClient: {
    fetch: async () =>
      ["w1", "w2", "w3"].map((id, i) => ({
        _id: id, title: `Item ${id}`, description: null, longer_description: null,
        class: "do_now", class_order: i, link_tab: null, module: null, submodule: null, i18n: null,
      })),
  },
}));

import { createClient } from "@/lib/supabase/client";
import {
  addCustomTask, deleteCustomTask, getCustomTasks, getTasks, saveChecklistOrder,
  setSuggestedTaskDismissed, toggleTask,
} from "@/services/checklist";

const API_URL = process.env.PROBE_API_URL!;
const PHASE = process.env.PROBE_PHASE!;
const PASSWORD = "probe-password-1";
const out: Record<string, unknown> = { phase: PHASE };
afterAll(() => fs.writeFileSync(process.env.PROBE_OUT!, JSON.stringify(out, null, 2)));

async function adminFetch(path: string, init: RequestInit = {}) {
  const key = process.env.PROBE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function createAccount(label: string) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@probe.invalid`;
  const r = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (r.status !== 200) throw new Error(`createUser ${r.status}`);
  return email;
}

/** Signs the web app's own singleton client in, and gives the account an onboarding row. */
async function signIn(email: string) {
  const supabase = createClient();
  await supabase.auth.signOut().catch(() => {});
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
  const onboarding = await supabase.from("user_onboarding_profiles")
    .upsert({ id: data.user.id, persona: "student", stage: 1 }, { onConflict: "id" });
  if (onboarding.error) throw new Error(`onboarding fixture: ${onboarding.error.message}`);
  return { id: data.user.id, jwt: data.session.access_token };
}

async function actions(jwt: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/functions/v1/companion-actions`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: process.env.PROBE_ANON_KEY!, authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ contract_version: 1, client: { platform: "web", app_version: "probe" }, ...body }),
  });
  return { status: res.status, json: await res.json() };
}
const applyOps = (jwt: string, operations: unknown[], authorization: unknown = { kind: "ui_control" }) =>
  actions(jwt, { action: "apply", operation_id: crypto.randomUUID(), authorization, operations });

/** What the web Checklist would render: one entry per task, no ids or timestamps. */
const view = async () =>
  (await getTasks("en"))
    .map((t) => ({ key: t.isCustom ? `custom:${t.title}` : t.id, completed: t.completed, dismissed: t.dismissedAt != null, hasCompletedAt: t.completedAt != null }))
    .sort((a, b) => a.key.localeCompare(b.key));

describe(`web checklist consumer, phase ${PHASE}`, () => {
  it("talks only to the local stack", () => {
    const client = createClient() as any;
    const url = String(client.supabaseUrl ?? client.rest?.url ?? "");
    expect(url.startsWith("http://127.0.0.1:")).toBe(true);
    out.clientUrlIsLocal = true;
    out.supabaseJsVersion = JSON.parse(fs.readFileSync("node_modules/@supabase/supabase-js/package.json", "utf8")).version;
    out.ssrVersion = JSON.parse(fs.readFileSync("node_modules/@supabase/ssr/package.json", "utf8")).version;
  });

  it("runs the web checklist scenario", async () => {
    await signIn(await createAccount(`web-${PHASE}`));
    const steps: Record<string, unknown> = {};
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        const v = await fn();
        steps[name] = v === undefined ? "ok" : v;
      } catch (e: any) {
        steps[name] = `error: ${e?.code ?? ""} ${e?.message ?? e}`.trim();
      }
    };
    await step("initial", view);
    await step("complete", () => toggleTask({ id: "w1", isCustom: false, completed: false }));
    await step("afterComplete", view);
    await step("uncomplete", () => toggleTask({ id: "w1", isCustom: false, completed: true }));
    await step("dismiss", () => setSuggestedTaskDismissed("w2", true));
    await step("afterDismiss", view);
    await step("restore", () => setSuggestedTaskDismissed("w2", false));
    await step("addCustom", () => addCustomTask({ title: "Web task", description: "Notes", priority: "Do soon" }));
    await step("addCustomEmptyDescription", () => addCustomTask({ title: "Empty", description: "", priority: "Do now" }));
    await step("customs", async () => (await getCustomTasks()).map((t) => [t.title, t.completed]));
    await step("toggleCustom", async () => {
      const t = (await getCustomTasks()).find((x) => x.title === "Web task")!;
      await toggleTask({ id: t.id, isCustom: true, completed: false });
    });
    await step("afterCustomToggle", view);
    await step("order", () => saveChecklistOrder("Do now", ["sanity:w1", "sanity:w2"]));
    await step("deleteCustom", async () => {
      const t = (await getCustomTasks()).find((x) => x.title === "Web task")!;
      await deleteCustomTask(t.id);
    });
    await step("final", view);
    out.scenario = steps;
  });

  it("reads the account it seeded in the baseline phase", async () => {
    let carry: { email: string };
    if (PHASE === "baseline") {
      carry = { email: await createAccount("web-carry") };
      fs.writeFileSync(process.env.PROBE_CARRY!, JSON.stringify(carry));
      await signIn(carry.email);
      await toggleTask({ id: "w3", isCustom: false, completed: false });
      await setSuggestedTaskDismissed("w2", true);
      await addCustomTask({ title: "Carry custom", description: "kept", priority: "Do now" });
    } else {
      carry = JSON.parse(fs.readFileSync(process.env.PROBE_CARRY!, "utf8"));
      await signIn(carry.email);
    }
    out.carry = await view();
  });

  const migrated = PHASE === "up" || PHASE === "upagain";
  (migrated ? it : it.skip)("web writes meet rich state from the action service", async () => {
    const me = await signIn(await createAccount(`web-mix-${PHASE}`));
    const state = async (ref: string) =>
      ((await actions(me.jwt, { action: "read" })).json.tasks as any[]).find((t) => t.task_ref === ref);
    const mix: Record<string, unknown> = {};

    await applyOps(me.jwt, [{ type: "task.set_state", task_ref: "sanity:w1", state: "waiting", waiting_reason: "Letter", expected_revision: 0 }]);
    mix.waitingShownAs = (await view()).find((t) => t.key === "w1");
    await toggleTask({ id: "w1", isCustom: false, completed: false });
    const a = await state("sanity:w1");
    mix.waitingThenWebComplete = [a.state, a.waiting_reason];

    await applyOps(me.jwt, [{ type: "task.set_state", task_ref: "sanity:w2", state: "completed", expected_revision: 0 }]);
    await toggleTask({ id: "w2", isCustom: false, completed: true });
    mix.completedThenWebUncheck = (await state("sanity:w2")).state;

    const created = await applyOps(me.jwt, [{ type: "task.create_custom", title: "Removed by new client", priority: "Do soon" }]);
    await applyOps(me.jwt, [{ type: "task.remove", task_ref: created.json.results[0].task_ref, expected_revision: 1 }], { kind: "ui_control", removal_confirmed: true });
    const kept = await applyOps(me.jwt, [{ type: "task.create_custom", title: "Kept", priority: "Do soon" }]);
    const keptRef = kept.json.results[0].task_ref;
    mix.webViewAfterNewRemoval = (await view()).filter((t) => t.key.startsWith("custom:"));
    mix.webCustomsAfterNewRemoval = (await getCustomTasks()).map((t) => t.title);

    const rem = await applyOps(me.jwt, [{ type: "reminder.schedule", task_ref: keptRef, remind_at: new Date(Date.now() + 86400000).toISOString(), time_zone: "America/Vancouver", expected_revision: 1 }]);
    mix.reminderScheduled = rem.status;
    await deleteCustomTask(keptRef.split(":")[1]);
    mix.reminderAfterWebDelete = (await adminFetch(`/rest/v1/companion_task_reminders?select=status,cancelled_reason&user_id=eq.${me.id}`)).json;
    out.mixed = mix;
  });
});
