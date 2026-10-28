// #365 corrections r1 (S365-002): the real web app (next dev, 127.0.0.1:3194) against the
// owned disposable stack unify-edits-365-corrections-r1. Two clear waiting-state commands
// and a later rename, typed by keyboard in the real composer; the command cards and the
// task drawer receipt must name the waiting reason before and after, and keep them once
// the receipt is history. Desktop, 390 px and 200 % zoom (640 css px at scale 2). Model
// requests are blocked and counted (must stay 0). Reads the database only through the
// user's JWT. Adapted from DOCS/companion-actions/evidence/365/browser/check.cjs.
const { createRequire } = require('node:module');
const req = createRequire('/tmp/unify-review-actions-361-web-r5-deno-candidate-9d05/package.json');
const { chromium } = req('playwright');
const { createClient } = req('@supabase/supabase-js');
const fs = require('node:fs');
const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const BASE = 'http://127.0.0.1:3194';
const API = process.env.ACTIONS_API_URL, ANON = process.env.ACTIONS_ANON_KEY;
if (API !== 'http://127.0.0.1:61611') throw new Error('refusing a non-owned stack');
const TASK = 'Get a phone plan';

(async () => {
  const result = { errors: [], console: [] };
  const db = createClient(API, ANON, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: seed.email, password: seed.password });
  const row = async () => (await db.from('custom_checklist_tasks')
    .select('title, progress_state, waiting_reason, revision').eq('id', seed.taskId).single()).data;
  const browser = await chromium.launch({ headless: true });
  const run = async (name, ctxOpts, fn) => {
    const ctx = await browser.newContext({ locale: 'en-CA', reducedMotion: 'reduce', ...ctxOpts });
    const page = await ctx.newPage();
    await ctx.addCookies([{ name: 'unify_lang', value: 'en', url: BASE }]);
    await ctx.addInitScript(() => { try { localStorage.setItem('i18nextLng', 'en'); localStorage.setItem('user_preferred_language', 'en'); } catch {} });
    let modelRequests = 0; const actions = [];
    page.on('pageerror', e => result.errors.push(`${name}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') result.console.push(`${name}: ${m.text().slice(0, 300)}`); });
    page.on('request', r => { if (r.url().endsWith('/api/companion/actions')) actions.push(JSON.parse(r.postData() || '{}').action); });
    await page.route('**/api/companion', route => { modelRequests++; return route.abort(); });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    for (let i = 0; i < 5; i++) {
      await page.locator('input[type="email"]').fill(seed.email);
      await page.locator('input[type="password"]').fill(seed.password);
      if (await page.locator('button[type="submit"]').isEnabled()) break;
      await page.waitForTimeout(1000);
    }
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 });
    page.dismissTour = async () => {
      const skip = page.locator('div.fixed.inset-0').getByRole('button', { name: /^Skip$/ });
      await skip.first().waitFor({ timeout: 5000 }).then(() => skip.first().click()).catch(() => {});
    };
    page.openConversation = async () => {
      await page.goto(`${BASE}/companion`);
      await page.dismissTour();
      const menu = page.getByRole('button', { name: 'Conversations' });
      if (await menu.isVisible().catch(() => false)) await menu.click();
      await page.getByText('First week in Vancouver').first().click();
    };
    page.overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const out = await fn(page);
    out.modelRequests = modelRequests;
    out.actionCounts = Object.fromEntries([...new Set(actions)].map(a => [a, actions.filter(x => x === a).length]));
    await ctx.close();
    return out;
  };
  const lines = async loc => (await loc.innerText()).split('\n').map(s => s.trim()).filter(Boolean);
  const cardBox = loc => loc.evaluate(el => {
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), overflow: el.scrollWidth > el.clientWidth };
  });

  result.desktop = await run('desktop', { viewport: { width: 1280, height: 900 } }, async (page) => {
    const r = {};
    await page.openConversation();
    const box = page.getByRole('textbox', { name: /message/i });
    // Keyboard only: focus the composer, type, Enter.
    await box.focus();
    await page.keyboard.type(`Mark task "${TASK}" as waiting: Appointment on Friday`);
    await page.keyboard.press('Enter');
    const first = page.getByRole('article', { name: `${TASK}: Not started → Waiting` });
    await first.waitFor({ timeout: 20000 });
    r.firstCard = await lines(first);
    r.rowAfterFirst = await row();
    await box.focus();
    await page.keyboard.type(`Mark task "${TASK}" as waiting: Appointment on Monday`);
    await page.keyboard.press('Enter');
    const second = page.getByRole('article', { name: `${TASK}: Waiting → Waiting` });
    await second.waitFor({ timeout: 20000 });
    r.secondCard = await lines(second);
    r.rowAfterSecond = await row();
    // The card's View control by keyboard: Tab from the card's last text reaches it.
    const view = second.getByRole('button', { name: new RegExp(TASK) });
    await view.focus();
    r.viewFocused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    r.drawer = (await lines(dialog)).filter(l => /Waiting|→|changed|Undo/i.test(l));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    r.focusAfterEscape = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    // A later edit: the second receipt becomes history and keeps its reasons.
    await box.focus();
    await page.keyboard.type(`Rename task "${TASK}" to "Prepaid plan"`);
    await page.keyboard.press('Enter');
    await page.getByRole('article', { name: 'Changed in Checklist: Prepaid plan' }).waitFor({ timeout: 20000 });
    await second.getByText(/This task changed after this/).waitFor({ timeout: 20000 });
    r.secondCardHistorical = await lines(second);
    r.rowAfterRename = await row();
    r.docOverflow = await page.overflow();
    await page.screenshot({ path: `${OUT}/desktop-reason-cards.png` });
    return r;
  });

  // The same conversation, reopened at narrow width and at 200 % zoom: saved receipts
  // come from the conversation read, not from the session that made them.
  for (const [name, opts] of [
    ['narrow390', { viewport: { width: 390, height: 844 } }],
    ['zoom200', { viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 }],
  ]) {
    result[name] = await run(name, opts, async (page) => {
      const r = {};
      await page.openConversation();
      // A reopened state-change card is named by the task's current title (a state receipt
      // records no title; observed in run 2, earlier behaviour, not S365-002).
      const second = page.getByRole('article', { name: 'Prepaid plan: Waiting → Waiting' });
      try {
        await second.waitFor({ timeout: 20000 });
      } catch (e) {
        r.failure = String(e.message).split('\n')[0];
        r.url = page.url();
        r.articles = await page.getByRole('article').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
        r.buttons = (await page.getByRole('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || e.textContent.trim()).filter(Boolean))).slice(0, 30);
        await page.screenshot({ path: `${OUT}/${name}-failure.png` });
        return r;
      }
      await second.scrollIntoViewIfNeeded();
      r.secondCard = await lines(second);
      r.secondBox = await cardBox(second);
      r.docOverflow = await page.overflow();
      await page.screenshot({ path: `${OUT}/${name}-reason-card.png` });
      return r;
    });
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
