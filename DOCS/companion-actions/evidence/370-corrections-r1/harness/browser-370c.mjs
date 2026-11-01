// #370 corrections r1: the reviewer's retained browser check (review-370-r1/browser-review.mjs),
// extended with frame-by-frame timing of the saving/checking states (T370-1) and every
// Reveal disclosure path by keyboard and by pointer (T370-2).
// Real-browser check of saved personal details on web (ticket #370) against a real local
// action service. Bundles the actual SavedDetailsPanel, the real useTaskProgress /
// useTaskActionStore hooks, client, store, real translations and the real Tailwind CSS,
// and drives them in headless Chromium by keyboard and mouse. Requests go to
// /api/companion/actions on this fixture server, which forwards them with the signed-in
// synthetic account's JWT to the real companion-actions edge function of the disposable
// local stack (as the Next.js proxy does with the cookie session).
//
// Proves, in a real browser with real persistence: a detail saved by a clear remember
// message is shown; a keyboard edit saves at the shown revision and names the change;
// Cancel after Remove sends nothing; a confirmed removal stops what a later answer reads
// (the user's own JWT and RLS, as rag-query reads) and its Undo restores it; another
// account reads none of it; the 390px layout has no horizontal overflow; Arabic renders
// right to left; measured control sizes. Does not prove: the Next.js app shell, the
// conversation cards, Safari/Firefox, screen readers, 200% zoom, native apps or a hosted
// stack.
//
// Usage (after `ACTIONS_KEEP=1 ./run.sh` in supabase/tests/companion-actions with the
// #370 migration applied and ACTIONS_* exported):
//   COMPANION_SAVED_DETAILS_PORT=<free port> node scripts/verify-companion-saved-details.mjs
//   COMPANION_SAVED_DETAILS_OUT=<json path> writes the results; PLAYWRIGHT_MODULE=<path> as in
//   the other verify scripts.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.COMPANION_SAVED_DETAILS_PORT || 60676);
const origin = `http://127.0.0.1:${port}`;
const API = process.env.ACTIONS_API_URL ?? "";
const ANON = process.env.ACTIONS_ANON_KEY ?? "";
const SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(API) || !ANON || !SERVICE) {
  console.error(
    "ACTIONS_API_URL (127.0.0.1 only), ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY are required",
  );
  process.exit(2);
}
const esbuild = await import("esbuild");
const postcss = (await import("postcss")).default;
const tailwind = (await import("@tailwindcss/postcss")).default;
const en = JSON.parse(
  await readFile(join(root, "lib/i18n/locales/en/translation.json"), "utf8"),
);
const ar = JSON.parse(
  await readFile(join(root, "lib/i18n/locales/ar/translation.json"), "utf8"),
);
const fill = (s, vars) =>
  Object.entries(vars).reduce(
    (out, [k, v]) => out.replaceAll(`{{${k}}}`, v),
    s,
  );

// ------------------------------------------------------------------ accounts

async function http(path, { key = ANON, jwt, body, method = "POST" } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${jwt ?? key}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function account(label) {
  const email = `${label}-${Date.now()}@details370.invalid`;
  const password = "details-browser-1";
  const made = await http("/auth/v1/admin/users", {
    key: SERVICE,
    body: { email, password, email_confirm: true },
  });
  if (made.status !== 200) throw new Error(`createUser ${made.status}`);
  const token = await http("/auth/v1/token?grant_type=password", {
    body: { email, password },
  });
  if (token.status !== 200) throw new Error(`signIn ${token.status}`);
  return { id: made.json.id, jwt: token.json.access_token };
}
const read = async (who) =>
  (
    await http("/functions/v1/companion-actions", {
      jwt: who.jwt,
      body: {
        contract_version: 1,
        client: { platform: "web", app_version: "browser-check" },
        action: "read",
      },
    })
  ).json;

/** A detail saved through the real service from the user's own clear remember message. */
async function remember(who, text) {
  const rest = (path, body) =>
    fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON,
        authorization: `Bearer ${who.jwt}`,
        prefer: "return=representation",
      },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const [conv] = await rest("/rest/v1/conversations?select=id", {
    user_id: who.id,
    title: "t",
  });
  const [msg] = await rest("/rest/v1/messages?select=id", {
    conversation_id: conv.id,
    role: "user",
    content: `Remember that ${text}`,
  });
  const action = (body) =>
    http("/functions/v1/companion-actions", {
      jwt: who.jwt,
      body: {
        contract_version: 1,
        client: { platform: "web", app_version: "browser-check" },
        ...body,
      },
    });
  const i = await action({ action: "interpret", message_id: msg.id });
  const w = await action({
    action: "apply",
    operation_id: crypto.randomUUID(),
    authorization: { kind: "direct_command", message_id: msg.id },
    operations: [i.json.command.operation],
  });
  if (w.status !== 200) throw new Error(`remember ${w.status}`);
  return w.json.receipt;
}
/** What a later answer reads: the user's own JWT and RLS (rag-query's read). */
const laterContext = async (who) =>
  (
    await http("/rest/v1/companion_saved_details?select=body", {
      jwt: who.jwt,
      method: "GET",
    })
  ).json.map((r) => r.body);

// ------------------------------------------------------------------ fixture

const ENTRY = String.raw`
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import en from "@/lib/i18n/locales/en/translation.json";
import ar from "@/lib/i18n/locales/ar/translation.json";
import { motionCssVars } from "@/lib/motion";
import { DetailReceipt, SavedDetailsPanel } from "@/components/companion/tasks/SavedDetails";
import { parseReceipt } from "@/lib/companionActions/contract";
import { useTaskActionStore, useTaskProgress } from "@/hooks/useTaskActions";

const lang = new URLSearchParams(location.search).get("lang") || "en";
document.documentElement.lang = lang;
document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
for (const [k, v] of Object.entries(motionCssVars)) document.documentElement.style.setProperty(k, v);
const i18n = createInstance();
i18n.use(initReactI18next).init({ lng: lang, resources: { en: { translation: en }, ar: { translation: ar } }, interpolation: { escapeValue: false }, initImmediate: false });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Panel() {
  const view = useTaskProgress();
  const store = useTaskActionStore("companion");
  if (new URLSearchParams(location.search).get("view") === "receipt") {
    // A creation receipt, as the command card shows it: its Undo removes the detail.
    const receipt = parseReceipt(window.__receipt);
    return <DetailReceipt receipt={receipt} storeKey={"command:" + receipt.operationId} store={store} view={view} />;
  }
  return <SavedDetailsPanel view={view} store={store} />;
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}>
    <main style={{ padding: 16, maxWidth: 480 }} className="bg-surface"><Panel /></main>
  </I18nextProvider></QueryClientProvider>,
);
`;

async function build() {
  const js = await esbuild.build({
    stdin: {
      contents: ENTRY,
      resolveDir: root,
      loader: "tsx",
      sourcefile: "details-fixture.tsx",
    },
    bundle: true,
    plugins: [
      {
        name: "saved-details-fixture-adapters",
        setup(b) {
          b.onResolve(
            { filter: /^@\/(hooks\/useAuthUser|lib\/posthog)$/ },
            ({ path }) => ({ path, namespace: "details-fixture" }),
          );
          b.onLoad(
            { filter: /.*/, namespace: "details-fixture" },
            ({ path }) => ({
              // The signed-in account is the one the fixture server holds the session of.
              contents: path.endsWith("useAuthUser")
                ? 'export const AUTH_USER_KEY = ["auth-user"]; export const useAuthUser = () => ({data:{id:window.__accountId},isPending:false});'
                : "export const isPostHogConfigured = () => false; export const posthog = {capture(){}};",
              loader: "js",
            }),
          );
        },
      },
    ],
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    loader: { ".json": "json" },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://fixture.invalid"',
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"fixture-public-key"',
      "process.env": "{}",
    },
    logLevel: "error",
  });
  const cssFrom = join(root, "app/globals.css");
  const css = await postcss([tailwind({ base: root })]).process(
    await readFile(cssFrom, "utf8"),
    { from: cssFrom },
  );
  return { js: js.outputFiles[0].text, css: css.css };
}

// ------------------------------------------------------------------ server

let session = null; // { id, jwt, receipt? } of the signed-in synthetic account
const HOLD_MS = 900;
let dropNext = false;
const writes = [];
async function serve(js, css) {
  const html = (id) =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><script>window.__accountId=${JSON.stringify(id)};window.__receipt=${JSON.stringify(session?.receipt ?? null)}</script></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    if (url.pathname === "/api/companion/actions" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks).toString("utf8");
      if (!session) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end('{"error":"unauthorized"}');
        return;
      }
      const parsed = JSON.parse(body);
      if (parsed.action === "apply" || parsed.action === "undo")
        writes.push(parsed);
      const upstream = await fetch(`${API}/functions/v1/companion-actions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: ANON,
          authorization: `Bearer ${session.jwt}`,
        },
        body,
      });
      // Hold apply and status replies so the pending states can be measured; a dropped
      // reply is a 504 after the service committed (the client must look it up).
      if (parsed.action === "apply" || parsed.action === "status") await new Promise(r=>setTimeout(r,HOLD_MS));
      if (parsed.action === "apply" && dropNext) {
        dropNext = false;
        await upstream.text();
        res.writeHead(504, { "content-type": "application/json" });
        res.end('{"error":"gateway_timeout"}');
        return;
      }
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(await upstream.text());
      return;
    }
    const [type, out] =
      url.pathname === "/app.js"
        ? ["text/javascript", js]
        : url.pathname === "/app.css"
          ? ["text/css", css]
          : ["text/html", html(session?.id ?? null)];
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(out);
  });
  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  return server;
}

// ------------------------------------------------------------------ checks

const results = [];
const check = (name, ok, detail) =>
  results.push({ name, ok: Boolean(ok), detail });
const FRIDAYS = "I can attend appointments on Fridays";
const SATURDAYS = "I can attend appointments on Saturdays";

async function open(page, lang = "en") {
  await page.goto(`${origin}/?lang=${lang}`);
  // Controls turn on after the panel's own fresh read.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button[aria-label]")][0];
    return b && b.getAttribute("aria-disabled") === "false";
  });
}


/** The enabled state of a named button. */
const whenEnabled = (page, name) =>
  page.waitForFunction(
    (n) =>
      [...document.querySelectorAll("button[aria-label], button")]
        .find((b) => (b.getAttribute("aria-label") ?? b.textContent) === n)
        ?.getAttribute("aria-disabled") === "false",
    name,
  );

/**
 * Every animation frame for `ms` after `act`: the computed opacity/transform of the element
 * `find` (a JS expression) returns. Sampled in the page, so no automation latency hides a frame.
 */
async function frames(page, find, act, ms = 700) {
  await page.evaluate(
    ({ src, ms }) => {
      const find = new Function(`return (${src})`);
      window.__frames = [];
      window.__t0 = null;
      const tick = () => {
        const now = performance.now();
        const el = find();
        if (el) {
          if (window.__t0 === null) window.__t0 = now;
          const cs = getComputedStyle(el);
          window.__frames.push({ t: Math.round(now - window.__t0), o: Number(cs.opacity), tr: cs.transform, v: cs.visibility });
        }
        if (window.__t0 === null || now - window.__t0 < ms) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { src: find, ms },
  );
  const tAct = await page.evaluate(() => performance.now());
  await act();
  await page.waitForTimeout(ms + 200);
  const out = await page.evaluate(() => ({ frames: window.__frames, t0: window.__t0 }));
  return { ...out, firstAfterAct: out.t0 === null ? null : Math.round(out.t0 - tAct) };
}
const instantly = (f) => f.frames.length > 0 && f.frames.every((x) => x.o === 1 && x.tr === "none");
const animated = (f) => f.frames.length > 0 && f.frames[0].o < 1 && f.frames.at(-1).o === 1;
/** Hidden (opacity 0) for every frame before 280ms, then visible: the 300ms loading delay. */
const delayed = (f) =>
  f.frames.length > 0 &&
  f.frames.filter((x) => x.t < 280).every((x) => x.o === 0) &&
  f.frames.some((x) => x.t >= 300 && x.o > 0) &&
  f.frames.some((x) => x.t >= 460 && x.o === 1);
const brief = (f) => ({ firstAfterAct: f.firstAfterAct, n: f.frames.length, sample: f.frames.filter((_, i) => i % 6 === 0).slice(0, 14) });

const EDITOR = `document.querySelector('textarea[aria-label="${en.savedDetails.editLabel}"]')?.parentElement`;
const CONFIRM = `[...document.querySelectorAll("p")].find(p => p.textContent === ${JSON.stringify(en.savedDetails.confirmTitle)})?.parentElement`;
const STATUS = (text) => `[...document.querySelectorAll("p")].find(p => p.textContent === ${JSON.stringify(text)})`;

async function run(browser) {
  const owner = await account("details-browser-owner");
  const stranger = await account("details-browser-stranger");
  await remember(owner, FRIDAYS);
  session = owner;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await open(page);
  check(
    "the saved detail is shown",
    await page.getByText(FRIDAYS, { exact: true }).isVisible(),
    null,
  );
  const editName = fill(en.savedDetails.editA11y, { text: FRIDAYS });
  const edit = page.getByRole("button", { name: editName });

  // T370-2, editor: pointer opens with the shared entrance motion; Enter and Space open at once.
  let f = await frames(page, EDITOR, () => edit.click());
  check("pointer: the editor opens with the shared entrance motion", animated(f), brief(f));
  await page.getByRole("button", { name: en.savedDetails.cancel }).click();
  for (const key of ["Enter", "Space"]) {
    await edit.focus();
    f = await frames(page, EDITOR, () => page.keyboard.press(key));
    check(`keyboard ${key}: the editor opens without entrance motion`, instantly(f), brief(f));
    if (key === "Space") break;
    await page.getByRole("button", { name: en.savedDetails.cancel }).click();
  }

  // T370-1, saving: hold the reply; the status stays hidden for 300ms, then fades in.
  const box = page.getByRole("textbox", { name: en.savedDetails.editLabel });
  await box.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(SATURDAYS);
  await page.getByRole("button", { name: en.savedDetails.save }).focus();
  f = await frames(page, STATUS(en.taskActions.saving), () => page.keyboard.press("Enter"), 600);
  check("saving: hidden before 300ms, then visible (loading delay)", delayed(f), brief(f));
  await page
    .getByText(fill(en.savedDetails.changed, { before: FRIDAYS, text: SATURDAYS }))
    .waitFor();
  const edits = writes.filter((w) => w.operations?.[0]?.type === "detail.update");
  check(
    "keyboard edit saves once at the shown revision",
    edits.length === 1 && edits[0].operations[0].expected_revision === 1,
    edits.map((w) => w.operations[0]),
  );
  check(
    "a later answer reads the edited text",
    JSON.stringify(await laterContext(owner)) === JSON.stringify([SATURDAYS]),
    await laterContext(owner),
  );

  // T370-1, checking: the reply is lost after commit; the lookup is held; same delay.
  const edit2 = page.getByRole("button", { name: fill(en.savedDetails.editA11y, { text: SATURDAYS }) });
  await whenEnabled(page, fill(en.savedDetails.editA11y, { text: SATURDAYS }));
  await edit2.focus();
  await page.keyboard.press("Enter");
  await box.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(SUNDAYS);
  await page.getByRole("button", { name: en.savedDetails.save }).focus();
  dropNext = true;
  await page.keyboard.press("Enter");
  // The lookup starts after the held, dropped apply reply; record from its first frame.
  f = await frames(page, STATUS(en.taskActions.checking), () => page.getByText(en.taskActions.checking, { exact: true }).waitFor({ state: "attached" }), 600);
  check("checking: hidden before 300ms, then visible (loading delay)", delayed(f), brief(f));
  await page
    .getByText(fill(en.savedDetails.changed, { before: SATURDAYS, text: SUNDAYS }))
    .waitFor();
  const sundays = writes.filter((w) => w.operations?.[0]?.text === SUNDAYS);
  check("a lost reply is looked up, never sent twice", sundays.length === 1, sundays.length);

  // T370-2, removal confirmation: pointer animates, keyboard is instant; Cancel sends nothing.
  const removeName = fill(en.savedDetails.removeA11y, { text: SUNDAYS });
  const remove = page.getByRole("button", { name: removeName });
  await whenEnabled(page, removeName);
  const before = writes.length;
  f = await frames(page, CONFIRM, () => remove.click());
  check("pointer: the removal confirmation opens with the shared entrance motion", animated(f), brief(f));
  await page.getByRole("button", { name: en.savedDetails.cancel }).click();
  await remove.focus();
  f = await frames(page, CONFIRM, () => page.keyboard.press("Enter"));
  check("keyboard: the removal confirmation opens without entrance motion", instantly(f), brief(f));
  await page.getByRole("button", { name: en.savedDetails.cancel }).click();
  check("Cancel after Remove sends nothing", writes.length === before, null);
  await remove.click();
  await page.getByRole("button", { name: en.savedDetails.confirmRemove }).click();
  await page.getByText(fill(en.savedDetails.removed, { text: SUNDAYS })).waitFor();
  const removal = writes[writes.length - 1];
  check(
    "the confirmed removal carries the confirmation",
    removal.authorization?.removal_confirmed === true,
    removal.authorization,
  );
  check(
    "a removed detail is no longer read by a later answer",
    (await laterContext(owner)).length === 0,
    await laterContext(owner),
  );
  const undoName = fill(en.savedDetails.undoRemoveA11y, { text: SUNDAYS });
  await page.getByRole("button", { name: undoName }).waitFor();
  await whenEnabled(page, undoName);
  await page.getByRole("button", { name: undoName }).click();
  await page.getByText(fill(en.savedDetails.restored, { text: SUNDAYS })).waitFor();
  check(
    "Undo of the removal restores the detail for later answers",
    JSON.stringify(await laterContext(owner)) === JSON.stringify([SUNDAYS]),
    await laterContext(owner),
  );
  // The restored row returns with the re-read that follows the Undo; measure it then.
  await page.getByRole("button", { name: fill(en.savedDetails.editA11y, { text: SUNDAYS }) }).waitFor();
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    sizes: [...document.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.textContent, w: Math.round(r.width), h: Math.round(r.height) };
    }),
  }));
  check("390px: no horizontal overflow", layout.overflow <= 0, layout.overflow);
  check(
    "detail controls are at least 44px tall",
    layout.sizes.length > 0 && layout.sizes.every((s) => s.h >= 44),
    layout.sizes,
  );
  await page.evaluate(() => (document.documentElement.style.zoom = "2"));
  const zoom = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  check("CSS 200 percent zoom has no horizontal overflow", zoom.overflow <= 0, zoom);
  await context.close();

  check(
    "another account reads none of it",
    (await read(stranger)).details?.length === 0 && (await laterContext(stranger)).length === 0,
    null,
  );

  // T370-2, the Undo of a save (the command card's receipt): its removal confirmation.
  const second = await account("details-browser-receipt");
  session = { ...second, receipt: await remember(second, FRIDAYS) };
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`${origin}/?view=receipt`);
  const undoSave = fill(en.savedDetails.undoSaveA11y, { text: FRIDAYS });
  await p2.getByRole("button", { name: undoSave }).waitFor();
  await whenEnabled(p2, undoSave);
  f = await frames(p2, CONFIRM, () => p2.getByRole("button", { name: undoSave }).click());
  check("pointer: the Undo-of-save confirmation opens with the shared entrance motion", animated(f), brief(f));
  await p2.getByRole("button", { name: en.savedDetails.cancel }).click();
  await p2.getByRole("button", { name: undoSave }).focus();
  f = await frames(p2, CONFIRM, () => p2.keyboard.press("Enter"));
  check("keyboard: the Undo-of-save confirmation opens without entrance motion", instantly(f), brief(f));
  await p2.getByRole("button", { name: en.savedDetails.cancel }).click();
  check("Cancel of the Undo-of-save confirmation keeps the detail", JSON.stringify(await laterContext(second)) === JSON.stringify([FRIDAYS]), await laterContext(second));
  await ctx2.close();

  // Reduced motion (informational): what the shared Reveal does for a pointer activation.
  session = owner;
  const ctxR = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const pR = await ctxR.newPage();
  await open(pR);
  const editR = pR.getByRole("button", { name: fill(en.savedDetails.editA11y, { text: SUNDAYS }) });
  await whenEnabled(pR, fill(en.savedDetails.editA11y, { text: SUNDAYS }));
  f = await frames(pR, EDITOR, () => editR.click());
  info.push({ name: "reduced motion, pointer: editor frames", instant: instantly(f), detail: brief(f) });
  await ctxR.close();

  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await open(p3, "ar");
  await p3.getByText(ar.savedDetails.intro).waitFor();
  const rtl = await p3.evaluate(() => ({
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  check("Arabic: right to left, Arabic copy, no overflow", rtl.dir === "rtl" && rtl.overflow <= 0, rtl);
  await ctx3.close();
}
const info = [];
const SUNDAYS = "I can attend appointments on Sundays";

// ------------------------------------------------------------------ main

const { js, css } = await build();
const server = await serve(js, css);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  await run(browser);
} catch (error) {
  errors.push(String(error?.stack ?? error));
} finally {
  await browser.close();
  server.close();
}
for (const r of results)
  console.log(
    `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  ${JSON.stringify(r.detail)}`}`,
  );
for (const e of errors) console.log(`ERROR (not an assertion)  ${e}`);
for (const i of info) console.log(`INFO  ${i.name}  ${JSON.stringify(i)}`);
const failed = results.filter((r) => !r.ok).length;
console.log(
  `\n${results.length - failed} passed, ${failed} failed, ${errors.length} errors`,
);
if (process.env.COMPANION_SAVED_DETAILS_OUT) {
  await writeFile(
    process.env.COMPANION_SAVED_DETAILS_OUT,
    JSON.stringify({ results, errors, info }, null, 2),
  );
}
process.exit(failed || errors.length ? 1 : 0);
